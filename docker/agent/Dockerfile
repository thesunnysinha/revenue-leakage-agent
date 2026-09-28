FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv export --frozen --no-dev --no-hashes --no-emit-project -o requirements.txt && \
    uv pip install --target=/app/.venv/lib/python3.11/site-packages -r requirements.txt

FROM python:3.11-slim-bookworm

ENV PYTHONPATH="/app/.venv/lib/python3.11/site-packages:$PYTHONPATH" \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    RELOAD=false \
    LOG_FORMAT=json

WORKDIR /app

RUN useradd --system --uid 10001 --no-create-home appuser
COPY --from=builder --chown=appuser /app/.venv /app/.venv
COPY --chown=appuser . .
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

CMD ["python", "server.py"]
