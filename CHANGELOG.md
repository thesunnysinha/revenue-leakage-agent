# Changelog

## [Unreleased]

### Added
- Revenue Leakage Agent (LangGraph + FastAPI + Next.js)
- 8 domain tools: `load_plan`, `query_invoices`, `fx_convert`, `propose_make_good_invoice`, `propose_credit_memo`, `propose_plan_amendment`, `apply`, `rollback`
- HITL approval gate using LangGraph `interrupt()` — graph pauses on `apply`/`rollback`, resumes via `/api/v1/agent/approval`
- Vercel AI SDK v7 frontend with `useChat` + `DefaultChatTransport` proxy to FastAPI
- Zustand store for `sessionId` and `pendingApproval` cross-render state
- Next.js Route Handlers at `/api/chat` and `/api/approval` bridging frontend ↔ FastAPI
- Guardrails: SecurityGuardrail, PIIGuardrail, ApprovalPolicyGuardrail, LoopGuardrail, GroundednessGuardrail
- structlog + OpenTelemetry + Jaeger observability
- `run.py` CLI: `dev`, `sync`, `check`, `docker up/down/logs`, `test`
- `docker-compose.yml` at repo root with hot-reload volume mounts
- Data directory at repo root (`data/`) mounted into container; sandbox writes gitignored
- Branded LedgerLens chat workspace with responsive conversation layout, action review card, metadata, and custom SVG app icon
- Modular backend tests covering repository behavior, domain tools, and guardrails
- GitHub Actions quality workflow enforcing changelog updates, test discovery/execution, lint, frontend typecheck, and production build

### Changed
- Switched from Anthropic Claude to OpenAI GPT-4o
- Moved `docker-compose.yml` from `docker/agent/` to repo root
- Moved `data/` from `services/agent/data` to repo root; `DATA_DIR` env var controls path
- Replaced plain `fetch` + `useState` frontend with Vercel AI SDK v7 `useChat`
- Reworked the frontend into a focused revenue-investigation workspace with responsive styling and accessible approval controls

### Fixed
- Groundedness checks now match formatted currency amounts (for example `$8,000`) against bare numeric values returned in JSON tool evidence, without treating plan IDs or ISO date parts as amounts
- Frontend displays a clear retry message for groundedness failures instead of showing the raw JSON error payload
- Long chat threads now scroll within the conversation pane while the composer stays visible; assistant replies render headings, emphasis, and lists as formatted Markdown
- Session ID entropy: replaced `uuid.uuid4().hex[:8]` (32-bit) with `secrets.token_urlsafe(24)` (192-bit)
- `CreditMemo` Pydantic model: field was `memo_id` not `credit_memo_id`; `customer_name` made optional
- LangGraph version bounds bumped to `>=1.0` (was `>=0.2.20`)
