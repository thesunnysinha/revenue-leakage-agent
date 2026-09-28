# Lesson: Vercel AI SDK v3→v7 Breaking Changes

**Date:** 2026-09-29

## What Changed

The `ai` package jumped from v3 to v7 with a complete protocol rewrite. If you're following any tutorial/blog from 2024 or early 2025, the API is completely different.

## Breaking Changes That Bit Us

### 1. `createDataStream` is gone
```ts
// OLD (v3/v4) — does not exist in v7
createDataStream({ execute(dataStream) { dataStream.writeTextDelta(...) } })

// NEW (v7)
createUIMessageStream({ execute({ writer }) { writer.write({ type: 'text-delta', ... }) } })
```

### 2. `useChat` no longer returns `input` / `handleInputChange` / `handleSubmit`
```ts
// OLD — these don't exist in v7
const { input, handleInputChange, handleSubmit, isLoading, data } = useChat()

// NEW — manage input yourself, use sendMessage
const { messages, sendMessage, setMessages, status } = useChat()
```

### 3. Metadata goes in `finish` chunk, not `data[]`
```ts
// OLD
dataStream.writeData({ session_id, requires_human_approval })
// useChat gives you data[]

// NEW
writer.write({ type: 'finish', messageMetadata: { session_id, requires_human_approval } })
// onFinish({ message }) → message.metadata
```

### 4. `DefaultChatTransport` replaces simple `api` string
```ts
// OLD
useChat({ api: '/api/chat', body: { sessionId } })

// NEW — use transport with prepareSendMessagesRequest for dynamic body
useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest({ messages }) {
      return { body: { query: lastText, sessionId: ref.current } };
    }
  })
})
```

## Debugging Tip

Always check what's actually installed with `node -e "const ai = require('ai'); console.log(Object.keys(ai))"` before assuming v3 APIs exist.
