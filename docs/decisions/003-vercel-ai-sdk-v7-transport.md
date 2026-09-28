# ADR-003: Vercel AI SDK v7 + Zustand for Frontend

**Status:** Accepted
**Date:** 2026-09-29

## Decision

Use `@ai-sdk/react@4` (`useChat` hook) with Zustand for session/approval state, with a Next.js Route Handler acting as a proxy adapter between the frontend and FastAPI backend.

## Context

The frontend needs to:
1. Show streaming chat messages
2. Manage session continuity across turns
3. Pause for human approval when the agent requests it

## Architecture

```
Browser (useChat) → /api/chat (Route Handler) → FastAPI /api/v1/agent/chat
                 → /api/approval (Route Handler) → FastAPI /api/v1/agent/approval
```

## Key API Changes in v7 vs v3/v4

| Old (v3) | New (v7) |
|---|---|
| `handleSubmit` | `sendMessage({ text })` |
| `handleInputChange` / `input` | manual `useState` |
| `isLoading` | `status: 'submitted' \| 'streaming' \| 'ready' \| 'error'` |
| `data[]` array for metadata | `messageMetadata` on `finish` chunk |
| `createDataStream` | `createUIMessageStream` with `execute({ writer })` |

## Stream Protocol (Route Handler)

```ts
writer.write({ type: 'start', messageId });
writer.write({ type: 'text-start', id: textId });
writer.write({ type: 'text-delta', id: textId, delta: text });
writer.write({ type: 'text-end', id: textId });
writer.write({ type: 'finish', finishReason: 'stop', messageMetadata: { ... } });
```

## Zustand Scope

Only two pieces of state warrant Zustand (cross-render, non-message state):
- `sessionId` — must survive between `sendMessage` calls
- `pendingApproval` — controls UI mode (approval card vs. normal input)

Message array lives in `useChat`.

## Consequences

- `DefaultChatTransport` with `prepareSendMessagesRequest` injects `{ query, sessionId }` as the request body
- `onFinish({ message })` reads `message.metadata` for approval metadata
- `BACKEND_URL` must be set as a server-side env var (not `NEXT_PUBLIC_`) in docker-compose
