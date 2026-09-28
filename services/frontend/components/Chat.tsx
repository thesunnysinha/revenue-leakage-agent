"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type TextUIPart, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChatStore } from "@/store/chat";
import ApprovalCard from "./ApprovalCard";
import MessageBubble from "./MessageBubble";
import styles from "./Chat.module.css";
import type { ChatResponse } from "@/lib/api";

type ChatMetadata = {
  session_id?: string;
  requires_human_approval?: boolean;
  pending_approval_details?: Record<string, unknown> | null;
  tools_executed?: string[];
  latency_ms?: number;
};
type AppUIMessage = UIMessage<ChatMetadata>;

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

function SparkMark() {
  return <span className={styles.sparkMark} aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.8 14.4 9.6 21.2 12l-6.8 2.4L12 21.2l-2.4-6.8L2.8 12l6.8-2.4L12 2.8Z" /><path d="m19 2 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z" /></svg></span>;
}

export default function Chat() {
  const { sessionId, pendingApproval, setSessionId, setPendingApproval, clearApproval, resetSession } = useChatStore();
  const [input, setInput] = useState("");
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const conversationRef = useRef<HTMLElement | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({
    api: "/api/chat",
    prepareSendMessagesRequest({ messages }) {
      const lastText = messages.at(-1)?.parts.find((part): part is TextUIPart => part.type === "text")?.text ?? "";
      return { body: { query: lastText, sessionId: useChatStore.getState().sessionId } };
    },
  }), []);

  const { messages, sendMessage, setMessages, status, error, clearError } = useChat<AppUIMessage>({
    transport,
    onFinish({ message }) {
      const meta = message.metadata;
      if (meta?.session_id) setSessionId(meta.session_id);
      if (meta?.requires_human_approval && meta.pending_approval_details) setPendingApproval(meta.pending_approval_details);
      else if (meta?.session_id) clearApproval();
    },
  });

  useEffect(() => {
    const pane = conversationRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages, status, pendingApproval]);

  const busy = status === "submitted" || status === "streaming" || approvalBusy;
  const hasConversation = messages.length > 0;

  function submit(query = input) {
    const value = query.trim();
    if (!value || busy || pendingApproval) return;
    clearError();
    setApprovalError(null);
    void sendMessage({ text: value });
    setInput("");
  }

  function startNewInvestigation() {
    setMessages([]);
    resetSession();
    clearError();
    setApprovalError(null);
    setInput("");
  }

  async function decideApproval(approved: boolean) {
    if (!sessionId || approvalBusy) return;
    setApprovalBusy(true);
    setApprovalError(null);
    try {
      const res = await fetch("/api/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, approved, reviewer_notes: "" }),
      });
      const result = await res.json() as ChatResponse & { message?: string };
      if (!res.ok) throw new Error(result.message || result.response || "Approval request failed.");
      setMessages((previous) => [...previous, {
        id: crypto.randomUUID(), role: "assistant",
        parts: [{ type: "text", text: result.response }],
        metadata: {
          session_id: result.session_id,
          requires_human_approval: result.requires_human_approval,
          pending_approval_details: result.pending_approval_details ?? null,
          tools_executed: result.tools_executed,
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

  return (
    <div className={`${styles.shell} ledgerlens-shell`}>
      <aside className={`${styles.rail} ledgerlens-rail`}>
        <a className={styles.brand} href="#home" aria-label="LedgerLens home">
          <SparkMark />
          <span><strong>ledgerlens</strong><small>REVENUE INTELLIGENCE</small></span>
        </a>

        <div className={styles.workspaceLabel}>WORKSPACE</div>
        <div className={styles.workspaceCard}>
          <span className={styles.workspaceIcon}>N</span>
          <span className={styles.workspaceText}><strong>Northstar SaaS</strong><small>Finance workspace</small></span>
          <span className={styles.chevron}>⌄</span>
        </div>

        <div className={styles.navGroup}>
          <div className={styles.workspaceLabel}>TOOLS</div>
          <div className={`${styles.navItem} ${styles.navActive}`}><span>⌕</span> Investigations <span className={styles.navCount}>01</span></div>
          <div className={styles.navItem}><span>▤</span> Billing data</div>
          <div className={styles.navItem}><span>◷</span> Activity log</div>
        </div>

        <div className={styles.railBottom}>
          <div className={styles.sandboxCard}>
            <span className={styles.sandboxDot} />
            <div><strong>Sandbox mode</strong><small>Changes need your approval</small></div>
          </div>
          <div className={styles.profile}><span className={styles.avatar}>S</span><span><strong>Sunny Sinha</strong><small>Finance analyst</small></span><button aria-label="Account options">···</button></div>
        </div>
      </aside>

      <main className={`${styles.main} ledgerlens-main`} id="home">
        <header className={`${styles.topbar} ledgerlens-topbar`}>
          <div className={styles.breadcrumb}><span>Workspace</span><i>/</i><strong>Investigations</strong></div>
          <div className={styles.topActions}><span className={styles.online}><span /> Agent ready</span><button className={styles.newButton} onClick={startNewInvestigation}><span>＋</span> New investigation</button></div>
        </header>

        <section ref={conversationRef} className={`${styles.conversation} ledgerlens-conversation`} aria-label="Revenue investigation chat">
          {!hasConversation ? (
            <div className={styles.welcome}>
              <div className={styles.eyebrow}><span className={styles.eyebrowLine} /> YOUR FINANCIAL DETECTIVE</div>
              <h1>Find what fell<br />through the <em>cracks.</em></h1>
              <p className={styles.welcomeCopy}>I’ll compare your billing plans with issued invoices, surface the evidence, and prepare safe corrections for your review.</p>
              <div className={styles.suggestions}>
                {suggestions.map((suggestion) => <button className={styles.suggestion} key={suggestion.title} onClick={() => submit(suggestion.prompt)} disabled={busy}>
                  <span className={styles.suggestionIcon}>{suggestion.icon}</span><span><strong>{suggestion.title}</strong><small>{suggestion.prompt}</small></span><span className={styles.suggestionArrow}>↗</span>
                </button>)}
              </div>
              <div className={styles.evidenceNote}><span>✳</span> Every finding is tied to your billing records. No changes happen without approval.</div>
            </div>
          ) : (
            <div className={styles.thread}>
              <div className={styles.threadHeading}><span className={styles.threadIcon}><SparkMark /></span><div><span>INVESTIGATION</span><h2>Billing review</h2></div></div>
              {messages.map((message) => {
                const text = message.parts.find((part): part is TextUIPart => part.type === "text")?.text ?? "";
                return <MessageBubble key={message.id} message={{ id: message.id, role: message.role as "user" | "assistant", content: text, tools: message.metadata?.tools_executed }} />;
              })}
              {pendingApproval && <ApprovalCard details={pendingApproval} busy={approvalBusy} onApprove={() => void decideApproval(true)} onReject={() => void decideApproval(false)} />}
              {busy && <div className={styles.thinking}><span className={styles.thinkingPulse} /><span>{approvalBusy ? "Recording your decision…" : "Reviewing billing records…"}</span></div>}
              {(error || approvalError) && <div className={styles.errorNotice} role="alert"><strong>Couldn’t complete that step.</strong><span>{approvalError ?? readableError(error)}</span><button onClick={() => { clearError(); setApprovalError(null); }}>Dismiss</button></div>}
            </div>
          )}
        </section>

        <footer className={`${styles.composerArea} ledgerlens-composer`}>
          <form className={styles.composer} onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} disabled={busy || !!pendingApproval} rows={1} aria-label="Ask LedgerLens" placeholder={pendingApproval ? "Review the proposed action above to continue" : "Ask about a plan, invoice, or billing discrepancy…"} />
            <div className={styles.composerBottom}><span><kbd>↵</kbd> to investigate <span className={styles.shortcutSep}>·</span> <kbd>⇧ ↵</kbd> for a new line</span><button type="submit" disabled={!input.trim() || busy || !!pendingApproval} aria-label="Send investigation"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M10 4l6 6-6 6" /></svg></button></div>
          </form>
          <p className={styles.footerNote}>LedgerLens can make mistakes. Verify financial actions before approval.</p>
        </footer>
      </main>
    </div>
  );
}
