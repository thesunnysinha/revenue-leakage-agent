export interface ChatResponse {
  session_id: string;
  trace_id: string;
  response: string;
  tools_executed: string[];
  tool_calls: ToolCallRecord[];
  latency_ms: number;
  requires_human_approval: boolean;
  pending_approval_details?: Record<string, unknown> | null;
}

export interface ToolCallRecord {
  tool_call_id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: "completed" | "failed" | "awaiting_approval" | "skipped";
  result?: string | null;
}

export interface ChatSummary {
  session_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  last_message: string;
  pending_approval_details: Record<string, unknown> | null;
}

export interface ChatMessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools_executed: string[];
  tool_calls: ToolCallRecord[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ChatTranscript extends ChatSummary {
  messages: ChatMessageRecord[];
}

export interface BillingPlanRecord {
  plan_id: string;
  customer_name: string;
  total_value: string;
  currency: string;
  cadence: string;
  start_date: string;
  entitlements: string[];
  notes?: string | null;
  amends?: string | null;
}

export interface InvoiceRecord {
  invoice_id: string;
  plan_id: string;
  customer_name: string;
  issue_date: string;
  due_date: string;
  amount_invoiced: string;
  currency: string;
  status: "paid" | "unpaid" | "void";
  description: string;
}

export interface CreditMemoRecord {
  memo_id: string;
  invoice_id: string;
  plan_id: string;
  customer_name?: string | null;
  issue_date: string;
  amount: string;
  currency: string;
  reason: string;
}

export interface ExchangeRateRecord {
  date: string;
  from_currency: string;
  to_currency: string;
  rate: string;
}

export interface BillingData {
  plans: BillingPlanRecord[];
  invoices: InvoiceRecord[];
  credit_memos: CreditMemoRecord[];
  exchange_rates: ExchangeRateRecord[];
}

export interface ToolActivityEvent {
  event_id: string;
  event_type: "tool_call";
  timestamp: string;
  session_id: string;
  chat_title: string;
  tool_call: ToolCallRecord;
}

export interface SandboxActivityEvent {
  action_id: string;
  draft_id: string;
  action_type: string;
  plan_id: string;
  applied_at: string;
  details: Record<string, unknown>;
}

export interface ActivityLog {
  tool_calls: ToolActivityEvent[];
  sandbox_actions: SandboxActivityEvent[];
}
