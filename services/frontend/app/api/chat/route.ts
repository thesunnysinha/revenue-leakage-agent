import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { randomUUID } from "crypto";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

export async function POST(request: Request) {
  const body = await request.json();
  const { query, sessionId } = body as { query: string; sessionId: string | null };

  const res = await fetch(`${BACKEND_URL}/api/v1/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id: sessionId ?? null }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = err as { message?: string; error_code?: string };
    return new Response(JSON.stringify({ error: error.message ?? "Backend error", error_code: error.error_code }), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await res.json();
  const messageId = randomUUID();
  const textId = randomUUID();

  const stream = createUIMessageStream({
    execute({ writer }) {
      writer.write({ type: "start", messageId });
      writer.write({ type: "text-start", id: textId });
      writer.write({ type: "text-delta", id: textId, delta: data.response as string });
      writer.write({ type: "text-end", id: textId });
      writer.write({
        type: "finish",
        finishReason: "stop",
        messageMetadata: {
          session_id: data.session_id as string,
          requires_human_approval: Boolean(data.requires_human_approval),
          pending_approval_details: (data.pending_approval_details as Record<string, unknown>) ?? null,
          tools_executed: (data.tools_executed as string[]) ?? [],
          latency_ms: data.latency_ms as number,
        },
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
