# Changelog

## [Unreleased]

### Fixed
- GitHub Actions now pins the published `setup-uv` release and generates Next.js route/layout types before TypeScript checks
- Added a visible, responsive demo sign-out action and a signed-out screen with a return path to saved investigations
- Chat progress now streams actual tool start/completion/failure events instead of showing a static billing-review message for every prompt

### Changed
- Expanded root ignore rules for local env/secrets, Python and frontend caches/builds, coverage, logs, and OS/editor artifacts while keeping env templates trackable
- Removed the broken `run.py test` command, which referenced a missing smoke-test script
- Removed tracked macOS `.DS_Store` artifacts and ignored future copies
- Added Docker first-run setup, service URLs, logs, hot-reload, and persistent-data instructions to project guidance

### Added
- SQLAlchemy ORM-backed chat sessions, transcripts, approval decisions, and LangGraph checkpoints; Alembic applies versioned schema migrations at API startup, and the UI can create, list, switch, and restore investigations
- Revenue Leakage Agent (LangGraph + FastAPI + Next.js)
- 8 domain tools: `load_plan`, `query_invoices`, `fx_convert`, `propose_make_good_invoice`, `propose_credit_memo`, `propose_plan_amendment`, `apply`, `rollback`
- HITL approval gate using LangGraph `interrupt()` — graph pauses on `apply`/`rollback`, resumes via `/api/v1/agent/approval`
- Vercel AI SDK v7 frontend with `useChat` + `DefaultChatTransport` proxy to FastAPI
- Zustand store for `sessionId` and `pendingApproval` cross-render state
- Next.js Route Handlers at `/api/chat` and `/api/approval` bridging frontend ↔ FastAPI
- Guardrails: SecurityGuardrail, PIIGuardrail, ApprovalPolicyGuardrail, LoopGuardrail, GroundednessGuardrail
- structlog + OpenTelemetry + Jaeger observability
- `run.py` CLI: `dev`, `sync`, `check`, `docker up/down/logs`
- `docker-compose.yml` at repo root with hot-reload volume mounts
- Data directory at repo root (`data/`) mounted into container; sandbox writes gitignored
- Branded LedgerLens chat workspace with responsive conversation layout, action review card, metadata, and custom SVG app icon
- Modular backend tests covering repository behavior, domain tools, and guardrails
- PostgreSQL integration coverage for chat transcript restoration and approval history
- Per-prompt tool activity in chat, including call inputs, completion status, concise results, and approval-pending writes
- Docker development hot reload for backend Python changes and frontend Next.js changes
- GitHub Actions quality workflow enforcing changelog updates, test discovery/execution, lint, frontend typecheck, and production build
- Shared high-entropy bearer authentication between Next.js server routes and FastAPI; protected all `/api/v1` routes while keeping `/health` public
- Startup validation and non-destructive preparation of the bundled demo dataset, with live sample counts and plan shortcuts in the test-environment UI
- Read-only Billing data and Activity log workspace views, backed by protected APIs for billing fixtures, persisted tool calls, and sandbox audit events

### Changed
- Switched from Anthropic Claude to OpenAI GPT-4o
- Moved `docker-compose.yml` from `docker/agent/` to repo root
- Moved `data/` from `services/agent/data` to repo root; `DATA_DIR` env var controls path
- Replaced plain `fetch` + `useState` frontend with Vercel AI SDK v7 `useChat`
- Reworked the frontend into a focused revenue-investigation workspace with responsive styling and accessible approval controls
- Replaced the hard-coded sample workspace/profile labels with an explicit test workspace and live fixture-data summary

### Fixed
- Groundedness checks now match formatted currency amounts (for example `$8,000`) against bare numeric values returned in JSON tool evidence, without treating plan IDs or ISO date parts as amounts
- Frontend displays a clear retry message for groundedness failures instead of showing the raw JSON error payload
- Long chat threads now scroll within the conversation pane while the composer stays visible; assistant replies render headings, emphasis, and lists as formatted Markdown
- Agent tool calls now emit structured requested, started, completed, failed, and loop-blocked events without logging financial values or tool output contents
- Session ID entropy: replaced `uuid.uuid4().hex[:8]` (32-bit) with `secrets.token_urlsafe(24)` (192-bit)
- `CreditMemo` Pydantic model: field was `memo_id` not `credit_memo_id`; `customer_name` made optional
- LangGraph version bounds bumped to `>=1.0` (was `>=0.2.20`)
