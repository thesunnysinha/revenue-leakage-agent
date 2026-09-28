export interface ChatResponse {
  session_id: string;
  trace_id: string;
  response: string;
  tools_executed: string[];
  latency_ms: number;
  requires_human_approval: boolean;
  pending_approval_details?: Record<string, unknown> | null;
}
