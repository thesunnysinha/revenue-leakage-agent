# ADR-001: LangGraph interrupt() for Human-in-the-Loop

**Status:** Accepted
**Date:** 2026-09-28

## Decision

Use LangGraph's `interrupt()` primitive with `AsyncPostgresSaver` as the HITL mechanism instead of a conversational "ask the user" pattern. `InMemorySaver` remains a test-only fallback for direct graph construction.

## Context

The challenge requires that sandbox writes (`apply`, `rollback`) only happen after explicit human approval. Two options were considered:

1. **Conversational ask**: LLM asks the user "shall I apply this?" and interprets the reply.
2. **Hard interrupt**: LangGraph pauses graph execution, serialises state, and resumes only with a `Command(resume=...)` from the approval endpoint.

## Rationale

- Option 1 is unreliable — the LLM can misinterpret a reply, accept ambiguous "ok", or be bypassed by prompt injection.
- `interrupt()` enforces the gate at the runtime level, not the prompt level. The graph literally cannot proceed without a `resume` signal.
- Verified as current best practice (LangGraph 1.0+ GA, October 2025). The `interrupt()` API is stable.

## Consequences

- The `/chat` endpoint may return `requires_human_approval: true` mid-session.
- Frontend must surface an approval card and disable input until the decision is made.
- The `/approval` endpoint resumes the paused graph thread.
- Session state and suspended approval checkpoints persist in PostgreSQL across API restarts.
