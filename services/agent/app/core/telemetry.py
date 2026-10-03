"""Telemetry for this service: the shared runtime's logging and tracing, configured from ``app.config``.

Console output in development, JSON lines otherwise (LOG_FORMAT=auto|console|json). Importing this module
installs the logging pipeline, as before.
"""

from __future__ import annotations

import structlog
from shared.services.agent.telemetry import (
    TelemetrySettings,
    add_otel_context,
    configure_telemetry,
    langfuse_enabled,
    parse_otlp_headers,
    setup_tracing,
    shutdown_tracing,
    trace_context,
    tracing_callbacks,
)

from app.config import config

configure_telemetry(
    TelemetrySettings(
        environment=config.environment,
        log_format=config.log_format,
        debug=config.debug,
        service_name=config.otel_service_name,
        trace_name="revops-agent",
        otel_endpoint=config.otel_exporter_endpoint,
        otel_headers=config.otel_exporter_headers,
        langfuse_public_key=config.langfuse_public_key,
        langfuse_secret_key=config.langfuse_secret_key,
        langfuse_base_url=config.langfuse_base_url,
    )
)

setup_telemetry = setup_tracing


def get_logger(name: str = "techtorch") -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name.removeprefix("app."))


__all__ = [
    "add_otel_context",
    "get_logger",
    "langfuse_enabled",
    "parse_otlp_headers",
    "setup_telemetry",
    "shutdown_tracing",
    "trace_context",
    "tracing_callbacks",
]
