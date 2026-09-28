"""Revenue Leakage Agent — HTTP Server."""
from __future__ import annotations
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Dict, Optional, Type

import structlog
import uvicorn
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from app.agents import BaseAgent, FinancialDetective
from app.agents.base import AgentResult
from app.config import config
from app.core.telemetry import get_logger, setup_telemetry, shutdown_tracing
from app.exceptions import (
    AgentServiceError, ApprovalPendingError, GraphUninitializedError,
    GuardrailViolationError, LoopBreakerError, NoPendingApprovalError,
    OutputHallucinationError, ProviderModelError, ToolExecutionError,
)
from app.guardrails import PIIGuardrail, SecurityGuardrail
from app.schemas import ChatRequest, ChatResponse, ErrorEnvelope, HealthStatus, HumanApprovalRequest

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
}


class ServerApplication:
    def __init__(self, agent: Optional[BaseAgent] = None) -> None:
        self.agent: BaseAgent = agent or FinancialDetective()
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
        setup_telemetry()
        self.agent.compile()
        logger.info("server.online", host=config.host, port=config.port)
        yield
        logger.info("server.shutting_down")
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
            except Exception:
                logger.error("request.failed", exc_info=True)
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

        @self.app.post("/api/v1/agent/chat", response_model=ChatResponse, tags=["Operations"])
        async def chat_endpoint(payload: ChatRequest, request: Request) -> ChatResponse:
            trace_id: str = getattr(request.state, "trace_id", str(uuid.uuid4()))
            session_id: str = payload.session_id or f"sess-{secrets.token_urlsafe(24)}"
            structlog.contextvars.bind_contextvars(session_id=session_id)
            validated = self.security_guardrail.evaluate(payload.query)
            sanitized = self.pii_guardrail.evaluate(validated)
            logger.info("agent.chat.received", query_chars=len(sanitized))
            start = time.perf_counter()
            result = await self.agent.execute(query=sanitized, session_id=session_id, trace_id=trace_id)
            return self._to_response(result, session_id, trace_id, (time.perf_counter() - start) * 1000)

        @self.app.post("/api/v1/agent/approval", response_model=ChatResponse, tags=["HITL"])
        async def handle_approval(payload: HumanApprovalRequest, request: Request) -> ChatResponse:
            trace_id: str = getattr(request.state, "trace_id", str(uuid.uuid4()))
            structlog.contextvars.bind_contextvars(session_id=payload.session_id)
            logger.info("agent.approval.decision", approved=payload.approved)
            start = time.perf_counter()
            result = await self.agent.resume_approval(
                session_id=payload.session_id,
                approved=payload.approved,
                notes=payload.reviewer_notes,
                trace_id=trace_id,
            )
            return self._to_response(result, payload.session_id, trace_id, (time.perf_counter() - start) * 1000)


server = ServerApplication()
app = server.app

if __name__ == "__main__":
    uvicorn.run("server:app", host=config.host, port=config.port, reload=config.reload, log_config=None, access_log=False)
