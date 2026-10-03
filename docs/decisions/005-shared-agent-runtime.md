# 005: Adopt the shared agent runtime

**Status:** Accepted

## Context

The agent plumbing (telemetry, guardrail base classes, PII and security guardrails, the loop guard, the exception
hierarchy and the approval-gated tool graph) was copied between this project and ai-life-coach, and the copies
drifted. master-project-template now holds one maintained version of it for all generated projects.

## Decision

Vendor `blueprints/shared/services/agent/` from master-project-template into `services/agent/shared/` and build on it.
This project keeps its domain: the prompt, the billing tools, `ApprovalPolicyGuardrail`, `GroundednessGuardrail`,
chat persistence, authentication and the HTTP layer. The old module paths remain as thin wrappers so imports and
test patches keep working, and `FinancialDetective` keeps its public signature (`execute(..., openai_api_key, ...)`).

## Consequences

Fixes to the shared plumbing arrive by copying a newer version of the directory; the source commit is recorded in
`shared/README.md`. `app/core/tool_logging.py` stays local for now because a test patches its module-level logger
and clock; moving it needs that test to patch the shared module instead. Logger names for guardrails now start with
`shared.services.agent` instead of `guardrails`.
