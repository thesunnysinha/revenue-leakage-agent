# ADR-004: Data Directory at Repo Root, Not Inside Service

**Status:** Accepted
**Date:** 2026-09-29

## Decision

The `data/` directory (JSON source files + sandbox) lives at repo root, mounted into the Docker container rather than baked into the service image.

## Rationale

- Source data (`billing_plans.json`, `invoices.json`, etc.) should be visible and editable without rebuilding the image
- Sandbox writes (`data/sandbox/*.json`) should persist across container restarts and be inspectable on the host
- Having data inside `services/agent/data` would have baked it into the image layer

## Mount in docker-compose

```yaml
volumes:
  - ./data:/app/data
environment:
  - DATA_DIR=/app/data
```

## Local Dev

Set `DATA_DIR=/absolute/path/to/technical-case/data` in `env/agent/.env`.
`run.py dev` injects this automatically: `env={**os.environ, "DATA_DIR": str(ROOT / "data")}`.

## Sandbox Gitignore

`data/sandbox/*.json` is gitignored. `data/sandbox/.gitkeep` preserves the directory in git.
