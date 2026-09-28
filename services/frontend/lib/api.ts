const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface ChatResponse {
  session_id: string;
  trace_id: string;
  response: string;
  tools_executed: string[];
  latency_ms: number;
  requires_human_approval: boolean;
  pending_approval_details?: Record<string, unknown> | null;
}

export async function sendMessage(query: string, sessionId?: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/v1/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, session_id: sessionId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? "Request failed");
  }
  return res.json();
}

export async function sendApproval(
  sessionId: string,
  approved: boolean,
  reviewerNotes?: string,
): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/api/v1/agent/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, approved, reviewer_notes: reviewerNotes }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message ?? "Approval request failed");
  }
  return res.json();
}
