"""Revenue Leakage Agent — HTTP Server."""

from __future__ import annotations
import asyncio
import json
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, Optional, Type

import structlog
import uvicorn
from fastapi import Depends, FastAPI, Header, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse

from app.agents import BaseAgent, FinancialDetective
from app.agents.base import AgentResult
from app.config import config
from app.core.migrations import upgrade_database
from app.core.auth import require_backend_auth
from app.core.tool_progress import tool_progress_hub
from app.domain.chat_repository import ChatRepository
from app.domain.repository import BillingRepository, setup_demo_data
from app.core.telemetry import get_logger, setup_telemetry, shutdown_tracing
from app.exceptions import (
    AgentServiceError,
    ApprovalPendingError,
    GraphUninitializedError,
    ChatNotFoundError,
    GuardrailViolationError,
    LoopBreakerError,
    NoPendingApprovalError,
    OutputHallucinationError,
    ProviderModelError,
    ToolExecutionError,
)
from app.guardrails import PIIGuardrail, SecurityGuardrail
from app.schemas import ChatRequest, ChatResponse, ChatSummary, ChatTranscript, ErrorEnvelope, HealthStatus, HumanApprovalRequest

logger = get_logger(__name__)

ERROR_STATUS: Dict[Type[AgentServiceError], int] = {
    AgentServiceError: status.HTTP_500_INTERNAL_SERVER_ERROR,
    GuardrailViolationError: status.HTTP_400_BAD_REQUEST,
    OutputHallucinationError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    LoopBreakerError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ToolExecutionError: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ProviderModelError: status.HTTP_502_BAD_GATEWAY,
    GraphUninitializedError: status.HTTP_503_SERVICE_UNAVAILABLE,
    ApprovalPendingError: status.HTTP_409_CONFLICT,
    NoPendingApprovalError: status.HTTP_409_CONFLICT,
    ChatNotFoundError: status.HTTP_404_NOT_FOUND,
}


class ServerApplication:
    def __init__(self, agent: Optional[BaseAgent] = None, chat_repository: Optional[ChatRepository] = None) -> None:
        self.agent: BaseAgent = agent or FinancialDetective()
        self.chat_repository = chat_repository or ChatRepository(config.database_url)
        self.security_guardrail = SecurityGuardrail()
        self.pii_guardrail = PIIGuardrail()
        self.start_time: float = time.time()
        self.app: FastAPI = FastAPI(
            title=config.app_name,
            version=config.app_version,
            lifespan=self._lifespan,
        )
        self._configure_middlewares()
        self._configure_exception_handlers()
        self._register_routes()

    @asynccontextmanager
    async def _lifespan(self, app: FastAPI) -> AsyncGenerator[None, None]:
        logger.info("server.booting", app=config.app_name, environment=config.environment)
        if not config.backend_api_token or len(config.backend_api_token) < 32:
            raise RuntimeError("BACKEND_API_TOKEN must be configured with at least 32 characters")
        demo = setup_demo_data(config.data_dir)
        logger.info("demo.dataset.ready", **demo.demo_overview()["counts"])
        setup_telemetry()
        try:
            await upgrade_database(config.database_url)
            await self.chat_repository.connect()
            await self.agent.startup(config.database_url)
        except Exception:
            await self.chat_repository.close()
            raise
        logger.info("server.online", host=config.host, port=config.port)
        try:
            yield
        finally:
            logger.info("server.shutting_down")
            try:
                await self.agent.shutdown()
            finally:
                await self.chat_repository.close()
                shutdown_tracing()

    def _configure_middlewares(self) -> None:
        wildcard = config.cors_origins == ["*"]
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=config.cors_origins,
            allow_credentials=not wildcard,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        @self.app.middleware("http")
        async def contextual_logging(request: Request, call_next) -> Response:
            trace_id = request.headers.get("X-Trace-ID", str(uuid.uuid4()))
            request.state.trace_id = trace_id
            structlog.contextvars.clear_contextvars()
            structlog.contextvars.bind_contextvars(trace_id=trace_id, method=request.method, path=request.url.path)
            start_t = time.perf_counter()
            try:
                response = await call_next(request)
                duration = (time.perf_counter() - start_t) * 1000
                response.headers["X-Trace-ID"] = trace_id
                response.headers["X-Process-Time-MS"] = f"{duration:.2f}"
                logger.info("request.completed", status_code=response.status_code, duration_ms=round(duration, 2))
                return response
            except Exception as exc:
                logger.error("request.failed", error_type=type(exc).__name__)
                raise
            finally:
                structlog.contextvars.clear_contextvars()

    def _configure_exception_handlers(self) -> None:
        def make_handler(status_code: int):
            async def handler(request: Request, exc: AgentServiceError) -> JSONResponse:
                trace_id = getattr(request.state, "trace_id", "unknown")
                details = {"tool_name": exc.tool_name} if isinstance(exc, ToolExecutionError) else exc.details
                logger.warning("request.rejected", error_code=exc.error_code, status_code=status_code)
                return JSONResponse(
                    status_code=status_code,
                    content=ErrorEnvelope(error_code=exc.error_code, message=exc.message, trace_id=trace_id, details=details).model_dump(),
                )

            return handler

        for exc_type, status_code in ERROR_STATUS.items():
            self.app.add_exception_handler(exc_type, make_handler(status_code))

    @staticmethod
    def _to_response(result: AgentResult, session_id: str, trace_id: str, latency_ms: float) -> ChatResponse:
        return ChatResponse(
            session_id=session_id,
            trace_id=trace_id,
            response=result.response,
            tools_executed=result.tools_executed,
            tool_calls=result.tool_calls,
            latency_ms=round(latency_ms, 2),
            requires_human_approval=result.requires_approval,
            pending_approval_details=result.pending_action,
        )

    def _register_routes(self) -> None:
        @self.app.get("/", include_in_schema=False)
        async def home() -> RedirectResponse:
            return RedirectResponse(url="/docs")

        @self.app.get("/health", response_model=HealthStatus, tags=["Diagnostics"])
        async def health_check() -> HealthStatus:
            return HealthStatus(
                status="healthy" if self.agent.is_ready else "degraded",
                version=config.app_version,
                environment=config.environment,
                uptime_seconds=round(time.time() - self.start_time, 2),
                graph_compiled=self.agent.is_ready,
            )

        @self.app.post(
            "/api/v1/chats",
            response_model=ChatSummary,
            tags=["Chats"],
            status_code=status.HTTP_201_CREATED,
            dependencies=[Depends(require_backend_auth)],
        )
        async def create_chat() -> ChatSummary:
            return await self.chat_repository.create_chat()

        @self.app.get("/api/v1/chats", response_model=list[ChatSummary], tags=["Chats"], dependencies=[Depends(require_backend_auth)])
        async def list_chats() -> list[ChatSummary]:
            return await self.chat_repository.list_chats()

        @self.app.get("/api/v1/chats/{session_id}", response_model=ChatTranscript, tags=["Chats"], dependencies=[Depends(require_backend_auth)])
        async def get_chat(session_id: str) -> ChatTranscript:
            chat = await self.chat_repository.get_chat(session_id)
            if chat is None:
                raise ChatNotFoundError(session_id)
            return chat

        @self.app.post("/api/v1/agent/chat", response_model=ChatResponse, tags=["Operations"], dependencies=[Depends(require_backend_auth)])
        async def chat_endpoint(
            payload: ChatRequest, request: Request, x_openai_api_key: str = Header(alias="X-OpenAI-API-Key", min_length=20, max_length=512)
        ) -> ChatResponse:
            trace_id: str = getattr(request.state, "trace_id", str(uuid.uuid4()))
            session_id = payload.session_id
            validated = self.security_guardrail.evaluate(payload.query)
            sanitized = self.pii_guardrail.evaluate(validated)
            logger.info("agent.chat.received", query_chars=len(sanitized))
            if session_id is None:
                session = await self.chat_repository.create_chat()
                session_id = session.session_id
            elif not await self.chat_repository.exists(session_id):
                raise ChatNotFoundError(session_id)
            structlog.contextvars.bind_contextvars(session_id=session_id)
            start = time.perf_counter()
            loop = asyncio.get_running_loop()

            def publish_tool_progress(tool_name: str, event_status: str, run_id: str) -> None:
                tool_progress_hub.publish_from_thread(
                    session_id,
                    {"tool_name": tool_name, "status": event_status, "tool_run_id": run_id},
                    loop,
                )

            result = await self.agent.execute(
                query=sanitized,
                session_id=session_id,
                trace_id=trace_id,
                openai_api_key=x_openai_api_key,
                progress_callback=publish_tool_progress,
            )
            await self.chat_repository.append_turn(
                session_id=session_id,
                user_content=sanitized,
                assistant_content=result.response,
                tools_executed=result.tools_executed,
                pending_approval_details=result.pending_action,
                tool_calls=result.tool_calls,
            )
            return self._to_response(result, session_id, trace_id, (time.perf_counter() - start) * 1000)

        @self.app.get("/api/v1/agent/tool-progress", tags=["Operations"], dependencies=[Depends(require_backend_auth)])
        async def tool_progress(session_id: str, request: Request) -> StreamingResponse:
            if not await self.chat_repository.exists(session_id):
                raise ChatNotFoundError(session_id)
            queue = await tool_progress_hub.subscribe(session_id)

            async def events():
                try:
                    yield "event: ready\ndata: {}\n\n"
                    while not await request.is_disconnected():
                        try:
                            event = await asyncio.wait_for(queue.get(), timeout=15)
                        except asyncio.TimeoutError:
                            yield ": keep-alive\n\n"
                            continue
                        yield f"event: tool\ndata: {json.dumps(event)}\n\n"
                finally:
                    await tool_progress_hub.unsubscribe(session_id, queue)

            return StreamingResponse(
                events(),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )

        @self.app.post("/api/v1/agent/approval", response_model=ChatResponse, tags=["HITL"], dependencies=[Depends(require_backend_auth)])
        async def handle_approval(
            payload: HumanApprovalRequest, request: Request, x_openai_api_key: str = Header(alias="X-OpenAI-API-Key", min_length=20, max_length=512)
        ) -> ChatResponse:
            trace_id: str = getattr(request.state, "trace_id", str(uuid.uuid4()))
            structlog.contextvars.bind_contextvars(session_id=payload.session_id)
            logger.info("agent.approval.decision", approved=payload.approved)
            if not await self.chat_repository.exists(payload.session_id):
                raise ChatNotFoundError(payload.session_id)
            start = time.perf_counter()
            result = await self.agent.resume_approval(
                session_id=payload.session_id,
                approved=payload.approved,
                notes=payload.reviewer_notes,
                trace_id=trace_id,
                openai_api_key=x_openai_api_key,
            )
            await self.chat_repository.append_approval_turn(
                session_id=payload.session_id,
                approved=payload.approved,
                reviewer_notes=payload.reviewer_notes,
                assistant_content=result.response,
                tools_executed=result.tools_executed,
                pending_approval_details=result.pending_action,
                tool_calls=result.tool_calls,
            )
            return self._to_response(result, payload.session_id, trace_id, (time.perf_counter() - start) * 1000)

        @self.app.get("/api/v1/demo/overview", tags=["Demo"], dependencies=[Depends(require_backend_auth)])
        async def demo_overview() -> Dict[str, object]:
            return BillingRepository(config.data_dir).demo_overview()

        @self.app.get("/api/v1/billing-data", tags=["Billing data"], dependencies=[Depends(require_backend_auth)])
        async def billing_data() -> Dict[str, object]:
            return BillingRepository(config.data_dir).billing_data()

        @self.app.get("/api/v1/activity", tags=["Activity"], dependencies=[Depends(require_backend_auth)])
        async def activity_log() -> Dict[str, object]:
            repository = BillingRepository(config.data_dir)
            return {
                "tool_calls": await self.chat_repository.list_tool_activity(),
                "sandbox_actions": repository.sandbox_activity(),
            }


server = ServerApplication()
app = server.app

if __name__ == "__main__":
    uvicorn.run("server:app", host=config.host, port=config.port, reload=config.reload, log_config=None, access_log=False)
