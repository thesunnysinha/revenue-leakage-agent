from __future__ import annotations
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from app.config import config


def build_chat_model(api_key: str) -> BaseChatModel:
    kwargs: dict = {
        "temperature": config.temperature,
        "max_tokens": config.max_tokens,
        "timeout": 60,
        "max_retries": 2,
    }
    kwargs["api_key"] = api_key
    return init_chat_model(config.model_name, model_provider=config.model_provider, **kwargs)
