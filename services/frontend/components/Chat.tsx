"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type TextUIPart, type UIMessage } from "ai";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "@/store/chat";
import ApprovalCard from "./ApprovalCard";
import ActivityLogView from "./ActivityLogView";
import BillingDataView from "./BillingDataView";
import MessageBubble from "./MessageBubble";
import ApiKeyGate from "./ApiKeyGate";
import styles from "./Chat.module.css";
import type { ChatResponse, ChatSummary, ChatTranscript, ToolCallRecord } from "@/lib/api";

type ChatMetadata = {
  session_id?: string;
  requires_human_approval?: boolean;
  pending_approval_details?: Record<string, unknown> | null;
  tools_executed?: string[];
  tool_calls?: ToolCallRecord[];
  latency_ms?: number;
  approval_decision?: boolean;
};
type AppUIMessage = UIMessage<ChatMetadata>;
type WorkspaceView = "chat" | "billing" | "activity";
type LiveToolProgress = { tool_run_id: string; tool_name: string; status: "started" | "completed" | "failed" };

function readableError(error: Error | undefined): string | undefined {
  if (!error) return undefined;
  try {
    const payload = JSON.parse(error.message) as { error?: unknown; message?: unknown; error_code?: unknown };
    if (payload.error_code === "GUARDRAIL_UNGROUNDED_OUTPUT_HALLUCINATION") {
      return "I couldn’t verify the figures in that response against the billing records. Please retry the investigation.";
    }
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
  } catch {
    // AI SDK errors are usually plain text; display those directly.
  }
  return error.message;
}

const suggestions = [
  { title: "Find missed billing", prompt: "Check ACME Corp for missing invoices and underbilling.", icon: "↗" },
  { title: "Review a plan", prompt: "Investigate billing plan C-1007-A1 for revenue leakage.", icon: "⌕" },
  { title: "Check FX adjustments", prompt: "Review cross-currency invoices and related credit memos.", icon: "⇄" },
];

type DemoOverview = {
  environment: string;
  dataset_status: string;
  sample_data: boolean;
  counts: { plans: number; invoices: number; credit_memos: number; exchange_rates: number; sandbox_actions: number };
  customers: string[];
  plans: { plan_id: string; customer_name: string }[];
};

function SparkMark() {
  return <span className={styles.sparkMark} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.8 14.4 9.6 21.2 12l-6.8 2.4L12 21.2l-2.4-6.8L2.8 12l6.8-2.4L12 2.8Z" /><path d="m19 2 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z" /></svg></span>;
}

export default function Chat() {
  const router = useRouter();
  const { sessionId, chats, setChats, upsertChat, pendingApproval, openaiApiKey, setOpenaiApiKey, setSessionId, setPendingApproval, clearApproval, resetSession } = useChatStore();
  const [input, setInput] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [chatLoadError, setChatLoadError] = useState<string | null>(null);
  const [chatsReady, setChatsReady] = useState(false);
  const [requestStarting, setRequestStarting] = useState(false);
  const [liveToolProgress, setLiveToolProgress] = useState<LiveToolProgress[]>([]);
  const [demoOverview, setDemoOverview] = useState<DemoOverview | null>(null);
  const [activeView, setActiveView] = useState<WorkspaceView>("chat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const conversationRef = useRef<HTMLElement | null>(null);
  const progressStreamRef = useRef<EventSource | null>(null);
  const requestSentRef = useRef(false);
  const refreshChats = useCallback(async () => {
    const response = await fetch("/api/chats", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load saved investigations.");
    const savedChats = await response.json() as ChatSummary[];
    setChats(savedChats);
    return savedChats;
  }, [setChats]);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    headers: () => {
      const key = useChatStore.getState().openaiApiKey;
      const headers: Record<string, string> = {};
      if (key) headers["X-OpenAI-API-Key"] = key;
      return headers;
    },
    prepareSendMessagesRequest({ messages }) {
      const lastText = messages.at(-1)?.parts.find((part): part is TextUIPart => part.type === "text")?.text ?? "";
      return { body: { query: lastText, sessionId: useChatStore.getState().sessionId } };
    },
  }), []);

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat<AppUIMessage>({
    transport,
    onFinish({ message }) {
      progressStreamRef.current?.close();
      progressStreamRef.current = null;
      setRequestStarting(false);
      setLiveToolProgress([]);
      const meta = message.metadata;
      if (meta?.session_id) setSessionId(meta.session_id);
      if (meta?.requires_human_approval && meta.pending_approval_details) setPendingApproval(meta.pending_approval_details);
      else if (meta?.session_id) clearApproval();
      void refreshChats().catch((cause: unknown) => setChatLoadError(cause instanceof Error ? cause.message : "Could not refresh saved chats."));
    },
    onError() {
      progressStreamRef.current?.close();
      progressStreamRef.current = null;
      setRequestStarting(false);
      setLiveToolProgress([]);
    },
  });

  useEffect(() => () => progressStreamRef.current?.close(), []);

  useEffect(() => {
    const pane = conversationRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages, status, pendingApproval]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/demo/overview", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Demo data unavailable");
        return await response.json() as DemoOverview;
      })
      .then((overview) => { if (!cancelled) setDemoOverview(overview); })
      .catch(() => { if (!cancelled) setDemoOverview(null); });
    return () => { cancelled = true; };
  }, []);

  const loadChat = useCallback(async (chatId: string) => {
    const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not open this saved investigation.");
    const transcript = await response.json() as ChatTranscript;
    setSessionId(transcript.session_id);
    setPendingApproval(transcript.pending_approval_details);
    setMessages(transcript.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text: message.content }],
      metadata: {
        session_id: transcript.session_id,
        tools_executed: message.tools_executed,
        tool_calls: message.tool_calls,
        requires_human_approval: Boolean(message.metadata.pending_approval_details),
        pending_approval_details: (message.metadata.pending_approval_details as Record<string, unknown> | undefined) ?? null,
        approval_decision: message.metadata.approval_decision as boolean | undefined,
      },
    } as AppUIMessage)));
    setChatLoadError(null);
  }, [setMessages, setPendingApproval, setSessionId]);

  const createNewChat = useCallback(async () => {
    const response = await fetch("/api/chats", { method: "POST" });
    if (!response.ok) throw new Error("Could not create a new investigation.");
    const chat = await response.json() as ChatSummary;
    upsertChat(chat);
    setSessionId(chat.session_id);
    setMessages([]);
    clearApproval();
    setInput("");
    setActiveView("chat");
    setChatLoadError(null);
  }, [clearApproval, setMessages, setSessionId, upsertChat]);

  useEffect(() => {
    let cancelled = false;
    if (!openaiApiKey) return () => { cancelled = true; };
    async function initializeChats() {
      try {
        const savedChats = await refreshChats();
        if (cancelled) return;
        if (savedChats.length > 0) await loadChat(savedChats[0].session_id);
        else await createNewChat();
      } catch (cause) {
        if (!cancelled) setChatLoadError(cause instanceof Error ? cause.message : "Could not load saved investigations.");
      } finally {
        if (!cancelled) setChatsReady(true);
      }
    }
    void initializeChats();
    return () => { cancelled = true; };
  }, [createNewChat, loadChat, openaiApiKey, refreshChats]);

  const busy = !chatsReady || requestStarting || status === "submitted" || status === "streaming" || approvalBusy;
  const hasConversation = messages.length > 0;

  function submit(query = input) {
    const value = query.trim();
    if (!value || !openaiApiKey || busy || !sessionId || pendingApproval) return;
    clearError();
    setApprovalError(null);
    progressStreamRef.current?.close();
    setLiveToolProgress([]);
    setRequestStarting(true);
    requestSentRef.current = false;
    const stream = new EventSource(`/api/tool-progress?sessionId=${encodeURIComponent(sessionId)}`);
    progressStreamRef.current = stream;
    const send = () => {
      if (requestSentRef.current) return;
      requestSentRef.current = true;
      setRequestStarting(false);
      void sendMessage({ text: value });
    };
    stream.onopen = send;
    stream.addEventListener("tool", (event) => {
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as LiveToolProgress;
        setLiveToolProgress((previous) => {
          const index = previous.findIndex((item) => item.tool_run_id === update.tool_run_id);
          if (index < 0) return [...previous, update];
          const next = [...previous];
          next[index] = update;
          return next;
        });
      } catch {
        // Ignore malformed progress events; the completed response remains authoritative.
      }
    });
    stream.onerror = () => {
      stream.close();
      if (progressStreamRef.current === stream) progressStreamRef.current = null;
      if (!requestSentRef.current) send();
    };
    setInput("");
  }

  async function startNewInvestigation() {
    try {
      await createNewChat();
      clearError();
      setApprovalError(null);
    } catch (cause) {
      setChatLoadError(cause instanceof Error ? cause.message : "Could not create a new investigation.");
    }
  }

  async function selectInvestigation(chatId: string) {
    if (busy || chatId === sessionId) return;
    try {
      await loadChat(chatId);
      setActiveView("chat");
      setInput("");
      clearError();
      setApprovalError(null);
    } catch (cause) {
      setChatLoadError(cause instanceof Error ? cause.message : "Could not open this saved investigation.");
    }
  }

  async function decideApproval(approved: boolean) {
    if (!sessionId || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenAI-API-Key": openaiApiKey ?? "" },
        body: JSON.stringify({ session_id: sessionId, approved, reviewer_notes: "" }),
      });
      const result = await res.json() as ChatResponse & { message?: string };
      if (!res.ok) throw new Error(result.message || result.response || "Approval request failed.");
      const decisionMessage: AppUIMessage = {
        id: crypto.randomUUID(), role: "user",
        parts: [{ type: "text", text: approved ? "Approved the proposed action." : "Rejected the proposed action." }],
      };
      setMessages((previous) => [...previous, decisionMessage, {
        id: crypto.randomUUID(), role: "assistant",
        parts: [{ type: "text", text: result.response }],
        metadata: {
          session_id: result.session_id,
          requires_human_approval: result.requires_human_approval,
          pending_approval_details: result.pending_approval_details ?? null,
          tools_executed: result.tools_executed,
          tool_calls: result.tool_calls,
          latency_ms: result.latency_ms,
        },
      } as AppUIMessage]);
      if (result.requires_human_approval && result.pending_approval_details) setPendingApproval(result.pending_approval_details);
      else clearApproval();
    } catch (cause) {
      setApprovalError(cause instanceof Error ? cause.message : "Could not record your decision.");
    } finally {
      setApprovalBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    progressStreamRef.current?.close();
    progressStreamRef.current = null;
    resetSession();
    setChats([]);
    setMessages([]);
    setLiveToolProgress([]);
    router.replace("/login");
    router.refresh();
  }

  if (!openaiApiKey) return <ApiKeyGate />;

  return (
    <div className={`${styles.shell} ${sidebarCollapsed ? styles.collapsed : ""} ledgerlens-shell`}>
      <aside className={`${styles.rail} ledgerlens-rail`}>
        <div className={styles.railHeader}>
          <a className={styles.brand} href="#home" aria-label="LedgerLens home">
            <SparkMark />
            <span><strong>ledgerlens</strong><small>REVENUE INTELLIGENCE</small></span>
          </a>
          <button className={styles.collapseButton} type="button" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
          </button>
        </div>

        <div className={`${styles.navGroup} ${styles.viewNav}`}>
          <button title="Investigations" aria-label="Investigations" className={`${styles.navItem} ${activeView === "chat" ? styles.navActive : ""}`} onClick={() => setActiveView("chat")}><span>⌕</span><span className={styles.navLabel}>Investigations</span></button>
          <button title="Billing data" aria-label="Billing data" className={`${styles.navItem} ${activeView === "billing" ? styles.navActive : ""}`} onClick={() => setActiveView("billing")}><span>▤</span><span className={styles.navLabel}>Billing data</span></button>
          <button title="Activity log" aria-label="Activity log" className={`${styles.navItem} ${activeView === "activity" ? styles.navActive : ""}`} onClick={() => setActiveView("activity")}><span>◷</span><span className={styles.navLabel}>Activity log</span></button>
        </div>

        <div className={styles.navGroup}>
          <div className={styles.workspaceLabel}>RECENT CHATS</div>
          <button className={`${styles.navItem} ${styles.newChatNav}`} title="New chat" aria-label="New chat" onClick={() => void startNewInvestigation()} disabled={!chatsReady || busy}><span>＋</span><span className={styles.navLabel}>New chat</span></button>
          <div className={styles.chatList}>
            {chats.map((chat) => <button
              className={`${styles.navItem} ${styles.chatEntry} ${chat.session_id === sessionId ? styles.navActive : ""}`}
              key={chat.session_id}
              onClick={() => void selectInvestigation(chat.session_id)}
              disabled={busy}
              title={chat.title}
              aria-label={chat.title}
            ><span>◷</span><span className={styles.chatEntryTitle}>{chat.title}</span></button>)}
          </div>
        </div>

        <div className={styles.railBottom}>
          <div className={styles.sandboxCard}>
            <span className={styles.sandboxDot} />
            <div><strong>Sandbox mode</strong><small>Changes need your approval</small></div>
          </div>
          <div className={styles.profile}><span className={styles.avatar}>D</span><span><strong>Demo reviewer</strong><small>Demo account</small></span></div>
        </div>
      </aside>

      <main className={`${styles.main} ledgerlens-main`} id="home">
        <header className={`${styles.topbar} ledgerlens-topbar`}>
          <div className={styles.breadcrumb}><strong>{activeView === "billing" ? "Billing data" : activeView === "activity" ? "Activity log" : "Investigations"}</strong></div>
          <select
            className={styles.mobileChatSelect}
            aria-label="Select a view or investigation"
            value={activeView === "chat" ? sessionId ?? "" : activeView}
            onChange={(event) => {
              if (event.target.value === "billing" || event.target.value === "activity") setActiveView(event.target.value);
              else if (event.target.value) { setActiveView("chat"); void selectInvestigation(event.target.value); }
            }}
            disabled={busy}
          >
            <option value="billing">Billing data</option><option value="activity">Activity log</option>
            {chats.map((chat) => <option key={chat.session_id} value={chat.session_id}>{chat.title}</option>)}
          </select>
          <div className={styles.topActions}><span className={styles.online}><span /> Agent ready</span><button className={styles.changeKeyButton} onClick={() => setOpenaiApiKey(null)}>Change key</button><button className={styles.logoutButton} onClick={signOut}>Sign out</button></div>
        </header>

        {activeView === "chat" ? <section ref={conversationRef} className={`${styles.conversation} ledgerlens-conversation`} aria-label="Revenue investigation chat" aria-busy={!chatsReady}>
          {chatLoadError && <div className={styles.errorNotice} role="alert"><strong>Saved chats unavailable.</strong><span>{chatLoadError}</span></div>}
          {hasConversation && demoOverview && <div className={styles.demoStrip} role="status"><span className={styles.demoTag}>TEST DATA</span><span>{demoOverview.counts.plans} plans · {demoOverview.counts.invoices} invoices · {demoOverview.counts.credit_memos} credit memos · {demoOverview.counts.sandbox_actions} sandbox actions</span><button onClick={() => submit("Check plan C-1001 for revenue leakage")} disabled={busy}>Try C-1001</button></div>}
          {!chatsReady ? <div className={styles.welcome}><p className={styles.welcomeCopy}>Loading your saved investigations…</p></div> : !hasConversation ? (
            <div className={styles.welcome}>
              <div className={styles.eyebrow}><span className={styles.eyebrowLine} /> YOUR FINANCIAL DETECTIVE</div>
              <h1>Find what fell<br />through the <em>cracks.</em></h1>
              <p className={styles.welcomeCopy}>I’ll compare your billing plans with issued invoices, surface the evidence, and prepare safe corrections for your review.</p>
              <section className={styles.demoPanel} aria-label="Demo dataset status">
                <div className={styles.demoPanelTop}><span className={styles.demoIcon}>▦</span><div><strong>Sample billing dataset</strong><small>{demoOverview?.dataset_status === "ready" ? "Loaded from local demo fixtures" : "Checking local demo fixtures…"}</small></div><span className={styles.demoTag}>SANDBOX</span></div>
                <div className={styles.demoCounts}>
                  <div><strong>{demoOverview?.counts.plans ?? "—"}</strong><small>plans</small></div>
                  <div><strong>{demoOverview?.counts.invoices ?? "—"}</strong><small>invoices</small></div>
                  <div><strong>{demoOverview?.counts.credit_memos ?? "—"}</strong><small>credit memos</small></div>
                  <div><strong>{demoOverview?.counts.sandbox_actions ?? "—"}</strong><small>applied actions</small></div>
                </div>
                {demoOverview && <div className={styles.demoCustomers}><span>Try a sample plan</span>{demoOverview.plans.map((plan) => <button key={plan.plan_id} onClick={() => submit(`Check plan ${plan.plan_id} for revenue leakage`)} disabled={busy} title={plan.customer_name}>{plan.plan_id}</button>)}</div>}
              </section>
              <div className={styles.suggestions}>
                {suggestions.map((suggestion) => <button className={styles.suggestion} key={suggestion.title} onClick={() => submit(suggestion.prompt)} disabled={busy}>
                  <span className={styles.suggestionIcon}>{suggestion.icon}</span><span><strong>{suggestion.title}</strong><small>{suggestion.prompt}</small></span><span className={styles.suggestionArrow}>↗</span>
                </button>)}
              </div>
              <div className={styles.evidenceNote}><span>✳</span> Every finding is tied to your billing records. No changes happen without approval.</div>
            </div>
          ) : (
            <div className={styles.thread}>
              <div className={styles.threadHeading}><span className={styles.threadIcon}><SparkMark /></span><div><span>INVESTIGATION</span><h2>{chats.find((chat) => chat.session_id === sessionId)?.title ?? "Billing review"}</h2></div></div>
              {messages.map((message) => {
                const text = message.parts.find((part): part is TextUIPart => part.type === "text")?.text ?? "";
                return <MessageBubble key={message.id} message={{
                  id: message.id,
                  role: message.role as "user" | "assistant",
                  content: text,
                  tools: message.metadata?.tools_executed,
                  toolCalls: message.metadata?.tool_calls,
                }} />;
              })}
              {pendingApproval && <ApprovalCard details={pendingApproval} busy={approvalBusy} onApprove={() => void decideApproval(true)} onReject={() => void decideApproval(false)} />}
              {(busy || liveToolProgress.length > 0) && <div className={styles.thinking} role="status" aria-live="polite">
                <span className={styles.thinkingPulse} />
                <div>
                  <span>{approvalBusy ? "Recording your decision…" : liveToolProgress.some((tool) => tool.status === "started") ? "Investigating with tools…" : requestStarting ? "Connecting to the investigator…" : status === "submitted" ? "Understanding your request…" : "Preparing findings…"}</span>
                  {liveToolProgress.length > 0 && <ul className={styles.liveToolList}>{liveToolProgress.map((tool) => <li key={tool.tool_run_id}><span>{tool.tool_name.replaceAll("_", " ")}</span><span>{tool.status === "started" ? "running" : tool.status}</span></li>)}</ul>}
                </div>
              </div>}
              {(error || approvalError) && <div className={styles.errorNotice} role="alert"><strong>Couldn’t complete that step.</strong><span>{approvalError ?? readableError(error)}</span><button onClick={() => { clearError(); setApprovalError(null); }}>Dismiss</button></div>}
            </div>
          )}
        </section> : <section className={`${styles.workspaceView} ledgerlens-conversation`} aria-label={activeView === "billing" ? "Billing records" : "Activity log"}>
          {activeView === "billing" ? <BillingDataView /> : <ActivityLogView />}
        </section>}

        {activeView === "chat" && <footer className={`${styles.composerArea} ledgerlens-composer`}>
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} disabled={busy || !!pendingApproval} rows={1} aria-label="Ask LedgerLens" placeholder={pendingApproval ? "Review the proposed action above to continue" : "Ask about a plan, invoice, or billing discrepancy…"} />
            <div className={styles.composerBottom}><span><kbd>↵</kbd> to investigate <span className={styles.shortcutSep}>·</span> <kbd>⇧ ↵</kbd> for a new line</span><button type="submit" disabled={!input.trim() || busy || !!pendingApproval} aria-label="Send investigation"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M10 4l6 6-6 6" /></svg></button></div>
          </form>
          <p className={styles.footerNote}>LedgerLens can make mistakes. Verify financial actions before approval.</p>
        </footer>}
      </main>
    </div>
  );
}
