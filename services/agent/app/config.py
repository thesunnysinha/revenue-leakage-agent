from __future__ import annotations
from functools import lru_cache
from pathlib import Path
from typing import List, Literal, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_env_file() -> Optional[Path]:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "env" / "agent" / ".env"
        if candidate.is_file():
            return candidate
    return None


ENV_FILE = _find_env_file()


class ApplicationSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    app_name: str = Field(default="Revenue Leakage Agent API")
    app_version: str = Field(default="1.0.0")
    environment: str = Field(default="development")
    debug: bool = Field(default=False)
    log_format: Literal["auto", "console", "json"] = Field(default="auto")

    data_dir: Path = Field(default=Path(__file__).resolve().parents[1] / "data")
    cors_origins: List[str] = Field(default_factory=lambda: ["*"])

    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    reload: bool = Field(default=True)

    openai_api_key: Optional[str] = Field(default=None, alias="OPENAI_API_KEY")
    model_name: str = Field(default="gpt-4o")
    model_provider: str = Field(default="openai")
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    max_tokens: Optional[int] = Field(default=4096)

    otel_exporter_endpoint: Optional[str] = Field(default=None, alias="OTEL_EXPORTER_OTLP_ENDPOINT")
    otel_service_name: str = Field(default="revenue-leakage-agent", alias="OTEL_SERVICE_NAME")
    langfuse_public_key: Optional[str] = Field(default=None, alias="LANGFUSE_PUBLIC_KEY")
    langfuse_secret_key: Optional[str] = Field(default=None, alias="LANGFUSE_SECRET_KEY")
    langfuse_base_url: str = Field(default="https://cloud.langfuse.com", alias="LANGFUSE_BASE_URL")


@lru_cache(maxsize=1)
def get_settings() -> ApplicationSettings:
    return ApplicationSettings()


config: ApplicationSettings = get_settings()
