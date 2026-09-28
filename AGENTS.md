# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What This Is

A stateful AI "financial detective" agent that investigates revenue leakage between billing contracts and invoices. It can propose and apply corrective actions (make-good invoices, credit memos, plan amendments) to a sandbox — but only after explicit human approval via a chat UI.

## Common Commands

All commands run from the repo root via `run.py`:

```bash
python run.py docker up        # build + start agent, frontend, jaeger (detached)
python run.py docker down      # stop and remove containers + volumes
python run.py docker logs      # tail agent-api logs
python run.py dev              # run FastAPI locally with uv (injects DATA_DIR automatically)
python run.py sync             # uv sync — install/update Python deps
python run.py check            # ruff lint + pytest
python run.py test             # smoke test against running server
```

**Local FastAPI dev** (without Docker):
```bash
# 1. Copy env/agent/.env.example → env/agent/.env and fill OPENAI_API_KEY + DATA_DIR
python run.py sync
python run.py dev
```

**Frontend dev** (without Docker):
```bash
cd services/frontend
npm install
npm run dev   # starts on :3000, proxies to localhost:8000 via Route Handlers
```

**Python linting + formatting:**
```bash
cd services/agent && uv run ruff check .
cd services/agent && uv run ruff format .
```

**Tests** — modular pytest coverage lives under `services/agent/tests/`. `run.py check` runs Ruff and pytest; for focused iteration:
```bash
cd services/agent && uv run pytest -q
cd services/agent && uv run pytest tests/domain/test_repository.py::TestReads::test_get_known_plan -v
```

## Architecture

### Request Flow

```
Browser → Next.js Route Handler (/api/chat) → FastAPI /api/v1/agent/chat → FinancialDetective
                                                                           ↓
                                                              LangGraph StateGraph
                                                              (pauses on write tools)
                                                                           ↓
Browser ← Next.js Route Handler (/api/approval) ← FastAPI /api/v1/agent/approval ← Command(resume=...)
```

### Backend: `services/agent/`

**Entry point:** `server.py` — `ServerApplication` wraps FastAPI, wires middleware, exception handlers, and three routes: `GET /health`, `POST /api/v1/agent/chat`, `POST /api/v1/agent/approval`.

**Agent graph** (`app/agents/financial_detective.py`): A LangGraph `StateGraph` with five nodes:
- `agent` — LLM reasoning node (GPT-4o with tools bound); checks loop guard and approval gate before returning
- `tools` — `ToolNode` executes any tool calls from the LLM
- `verify` — groundedness check; rejects hallucinated figures, retries up to `MAX_VERIFY_RETRIES`
- `approval_gate` — calls `interrupt(pending_action)` to hard-pause the graph; resumes only when `/approval` sends `Command(resume={approved: bool})`
- `fallback` — handles loop-detected state, returns safe summary

**Routing logic** (`route` function inside `compile()`):
```
agent → fallback       (loop_detected)
agent → approval_gate  (requires_approval — write tool detected)
agent → tools          (tool_calls present)
agent → verify         (plain text response)
```

**State** (`app/agents/state.py`): `AgentState` TypedDict — `messages`, `step_count`, `loop_detected`, `requires_approval`, `pending_action`, `verify_attempts`, `ungrounded_values`.

**Domain layer** (`app/domain/`):
- `tools.py` — 8 `@tool`-decorated functions. `WRITE_TOOLS = frozenset({"apply", "rollback"})` marks the two that require approval.
- `repository.py` — `BillingRepository` reads source JSON from `data/`, writes sandbox to `data/sandbox/`. Uses `Decimal` for all money. `get_repository()` is `lru_cache`-singleton.
- `prompts.py` — `PromptRegistry.get_system_directive()` returns the financial detective system prompt.
- `models.py` — Pydantic models for `BillingPlan`, `Invoice`, `CreditMemo`, `ActionDraft`.

**Guardrails** (`app/guardrails/`):
- `SecurityGuardrail`, `PIIGuardrail` — called at HTTP layer (before agent) on raw user input
- `ApprovalPolicyGuardrail` — called inside `_agent_node`; detects if a tool call is in `WRITE_TOOLS` and sets `requires_approval = True`
- `LoopGuardrail` — counts steps and detects repeated identical tool calls
- `GroundednessGuardrail` — called in `_verify_node`; finds values in the LLM's response that have no matching source in tool results

**Config** (`app/config.py`): `pydantic-settings` singleton. `_find_env_file()` walks parent directories to find `env/agent/.env`. Key fields: `openai_api_key`, `model_name`, `model_provider`, `data_dir`.

**Exceptions → HTTP status** (`server.py:ERROR_STATUS`): each custom exception class maps to a specific HTTP code (`GuardrailViolationError → 400`, `ApprovalPendingError → 409`, `GraphUninitializedError → 503`, etc.).

### Frontend: `services/frontend/`

Next.js 16 App Router. **Important:** Next.js 16 has breaking API changes — read `node_modules/next/dist/docs/` before writing any Next.js-specific code (see `AGENTS.md`).

**State split:**
- `useChat` (AI SDK v7) manages the message array and streaming
- `useChatStore` (Zustand, `store/chat.ts`) holds `sessionId` and `pendingApproval` — two pieces of state that outlive individual renders

**Route Handlers** (`app/api/`):
- `chat/route.ts` — receives `{ query, sessionId }` from the `DefaultChatTransport`, calls FastAPI, returns a `createUIMessageStreamResponse` with `text-start/text-delta/text-end/finish` chunks; approval metadata is in the `finish` chunk's `messageMetadata`
- `approval/route.ts` — thin proxy to FastAPI `/api/v1/agent/approval`, returns JSON

**AI SDK v7 pattern** in `Chat.tsx`:
```ts
// Transport injects dynamic sessionId from a ref (avoids stale closure)
const transport = useMemo(() => new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest({ messages }) {
    return { body: { query: lastText, sessionId: sessionIdRef.current } };
  }
}), []);

// Approval metadata comes from message.metadata in onFinish
const { messages, sendMessage, setMessages, status } = useChat<AppUIMessage>({
  transport,
  onFinish({ message }) { /* read message.metadata */ }
});
```

Approval responses are injected back into the message list via `setMessages(prev => [...prev, assistantMessage])`.

### Data

`data/` lives at repo root (not inside the service). JSON source files are read-only; `data/sandbox/` is writable (gitignored except `.gitkeep`). In Docker, this directory is bind-mounted at `/app/data`. Locally, set `DATA_DIR` in `env/agent/.env`.

### Infrastructure

- **`docker-compose.yml`** at root — three services: `agent-api` (:8000), `frontend` (:3000), `jaeger` (:16686 UI, :4318 OTLP)
- **`docker/agent/Dockerfile`** — multi-stage uv build, non-root `appuser` (uid 10001)
- **`docker/frontend/Dockerfile`** — Next.js standalone build
- Hot-reload in Docker: `services/agent/app/` and `server.py` are volume-mounted into the container

### Key Invariants

- **HITL is enforced at runtime, not prompt level.** `interrupt()` in `_approval_node` makes it physically impossible for `apply`/`rollback` to execute without a `Command(resume=...)` from the approval endpoint.
- **`DATA_DIR` must be set for local dev.** `run.py dev` injects it; direct `uv run python server.py` without the env var will default to `services/agent/data` (doesn't exist).
- **Session continuity.** The `thread_id` passed to `InMemorySaver` is the `session_id`. Each `/chat` call checks `graph.aget_state(cfg).next` — if non-empty, the graph is paused awaiting approval and a `409 ApprovalPendingError` is raised to prevent overwriting in-flight state.
- **Money uses `Decimal`.** `BillingRepository` loads JSON with `parse_float=Decimal`. Do not use `float` for financial calculations.
