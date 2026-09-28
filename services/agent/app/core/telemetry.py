"""Telemetry and Observability Subsystem (structlog + OpenTelemetry).

Console output in development, JSON lines otherwise (LOG_FORMAT=auto|console|json).
Standard-library records (uvicorn, httpx, langchain...) flow through the same pipeline,
so every line carries the request's bound context (trace_id, method, path) and the
active OpenTelemetry trace/span ids.
"""

from __future__ import annotations

import logging
import os
import sys
from contextlib import AbstractContextManager, nullcontext
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from app.config import config


def add_otel_context(_: Any, __: str, event_dict: Dict[str, Any]) -> Dict[str, Any]:
    span_context = trace.get_current_span().get_span_context()
    if span_context.is_valid:
        event_dict["otel_trace_id"] = format(span_context.trace_id, "032x")
        event_dict["otel_span_id"] = format(span_context.span_id, "016x")
    return event_dict


def parse_otlp_headers(raw: Optional[str]) -> Dict[str, str]:
    """Parses the standard OTEL_EXPORTER_OTLP_HEADERS format: key=value pairs, comma separated, URL-encoded values."""
    headers: Dict[str, str] = {}
    for pair in (raw or "").split(","):
        key, sep, value = pair.partition("=")
        if sep and key.strip():
            headers[key.strip()] = unquote(value.strip())
    return headers


def _use_json() -> bool:
    if config.log_format == "auto":
        return config.environment != "development"
    return config.log_format == "json"


def configure_logging() -> None:
    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        add_otel_context,
        structlog.processors.StackInfoRenderer(),
    ]
    json_mode = _use_json()
    if json_mode:
        renderer: Any = structlog.processors.JSONRenderer()
        exception_processors: list = [structlog.processors.dict_tracebacks]
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty() and "NO_COLOR" not in os.environ)
        exception_processors = []

    structlog.configure(
        processors=[*shared, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            *exception_processors,
            renderer,
        ],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.DEBUG if config.debug else logging.INFO)
    for noisy in ("httpx", "httpx2", "httpcore", "httpcore2", "openai", "urllib3", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


configure_logging()


def get_logger(name: str = "techtorch") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name.removeprefix("app."))


logger = get_logger("core.telemetry")


def langfuse_enabled() -> bool:
    return bool(config.langfuse_public_key and config.langfuse_secret_key)


def tracing_callbacks() -> List[Any]:
    """LangChain callbacks for the agent graph: the Langfuse handler when configured, otherwise none."""
    if not langfuse_enabled():
        return []
    from langfuse.langchain import CallbackHandler
    return [CallbackHandler(public_key=config.langfuse_public_key)]


def trace_context(session_id: str, trace_id: str) -> AbstractContextManager:
    """Tags everything traced inside the block with the session and request trace id (no-op without Langfuse)."""
    if not langfuse_enabled():
        return nullcontext()
    from langfuse import propagate_attributes
    return propagate_attributes(session_id=session_id, trace_name="revops-agent", metadata={"trace_id": trace_id})


def shutdown_tracing() -> None:
    if langfuse_enabled():
        from langfuse import get_client
        get_client().flush()


class TelemetryManager:
    @classmethod
    def setup_tracing(cls) -> None:
        if langfuse_enabled():
            # Langfuse's LangChain handler already records every model/tool/graph step, so the OpenInference
            # instrumentation is skipped in this mode to avoid duplicate spans.
            try:
                from langfuse import Langfuse
                Langfuse(
                    public_key=config.langfuse_public_key,
                    secret_key=config.langfuse_secret_key,
                    base_url=config.langfuse_base_url,
                    environment=config.environment,
                )
                logger.info("telemetry.langfuse.enabled", base_url=config.langfuse_base_url)
            except Exception as exc:
                logger.warning("telemetry.langfuse.bootstrap_failed", error=str(exc))
            return

        if not config.otel_exporter_endpoint:
            logger.info("telemetry.otel.disabled", reason="OTEL_EXPORTER_OTLP_ENDPOINT not set")
            return

        try:
            resource = Resource.create({"service.name": config.otel_service_name})
            provider = TracerProvider(resource=resource)
            exporter = OTLPSpanExporter(
                endpoint=f"{config.otel_exporter_endpoint.rstrip('/')}/v1/traces",
                headers=parse_otlp_headers(config.otel_exporter_headers) or None,
            )
            provider.add_span_processor(BatchSpanProcessor(exporter))
            trace.set_tracer_provider(provider)

            from openinference.instrumentation.langchain import LangChainInstrumentor
            LangChainInstrumentor().instrument()
            logger.info("telemetry.otel.enabled", endpoint=config.otel_exporter_endpoint)
        except Exception as exc:
            logger.warning("telemetry.otel.bootstrap_failed", error=str(exc))


setup_telemetry = TelemetryManager.setup_tracing
