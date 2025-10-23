# LedgerLens

LedgerLens is a financial detective that investigates billing plans against invoices, explains revenue leakage with supporting evidence, and prepares corrective actions for human approval in a sandbox.

## What it does

- Investigates billing plans, invoices, credit memos, and foreign exchange adjustments.
- Proposes make-good invoices, credit memos, and plan amendments.
- Requires explicit approval before sandbox changes are applied or rolled back.
- Keeps chat history and LangGraph checkpoints in PostgreSQL.
- Shows tool activity, billing fixtures, and an audit log in the web app.

## Run with Docker

Copy the environment templates:

```bash
cp env/agent/.env.example env/agent/.env
cp env/frontend/.env.local.example env/frontend/.env.local
```

Generate a random `BACKEND_API_TOKEN` and set the same value in both env files. It must be at least 32 characters. The frontend session also needs an `AUTH_SESSION_SECRET` of at least 32 characters; generate one with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Each visitor enters their own OpenAI API key on the login page. The app holds it in that browser tab's memory and sends it to the agent service for each model request; it is not saved in chat history or the database. The demo login defaults to `demo` / `ledgerlens-demo` in development. Set `DEMO_USERNAME` and `DEMO_PASSWORD` in `env/frontend/.env.local` to change them.

Start the application:

```bash
python run.py docker up
```

Open [http://localhost:3000](http://localhost:3000). The API health endpoint is [http://localhost:8000/health](http://localhost:8000/health), and Jaeger is at [http://localhost:16686](http://localhost:16686).

To stop the services while preserving chat and sandbox data:

```bash
python run.py docker down
```

## Local development

Start PostgreSQL, install the Python dependencies, and run the API:

```bash
docker compose up -d postgres
python run.py sync
python run.py dev
```

In another terminal, start the frontend:

```bash
cd services/frontend
npm install
npm run dev
```

Docker development mounts enable backend and frontend hot reload. See [AGENTS.md](AGENTS.md) for the repository architecture and additional commands, and [docs/architecture-diagrams.md](docs/architecture-diagrams.md) for the agent and approval flows.
