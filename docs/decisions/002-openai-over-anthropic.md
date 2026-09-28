# ADR-002: OpenAI GPT-4o as the Model Provider

**Status:** Accepted
**Date:** 2026-09-28

## Decision

Use OpenAI (`gpt-4o`) via `langchain-openai` instead of Anthropic Claude.

## Context

The initial implementation scaffolded with Anthropic Claude. The user switched to OpenAI mid-implementation.

## Change Required

- Swapped `langchain-anthropic` → `langchain-openai>=1.0`
- Changed `anthropic_api_key` → `openai_api_key` in config
- Changed model default from `claude-3-5-sonnet-20241022` → `gpt-4o`
- `MODEL_PROVIDER=openai` in all env/docker configs

## Consequences

- `OPENAI_API_KEY` is required in `env/agent/.env`
- `init_chat_model("gpt-4o", model_provider="openai")` handles the abstraction
- Swapping back to Anthropic requires only config changes — no code changes needed
