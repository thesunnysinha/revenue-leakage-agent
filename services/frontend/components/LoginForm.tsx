"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useChatStore } from "@/store/chat";
import styles from "./LoginForm.module.css";

type Credentials = { username: string; password: string } | null;

export default function LoginForm({ demoCredentials }: { demoCredentials: Credentials }) {
  const router = useRouter();
  const [username, setUsername] = useState(demoCredentials?.username ?? "");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!apiKey.trim()) {
      setError("Enter your OpenAI API key to continue.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not sign in.");
      useChatStore.getState().setOpenaiApiKey(apiKey.trim());
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <section className={styles.card} aria-labelledby="login-title">
          <Link className={styles.brand} href="/" aria-label="LedgerLens">
            <span className={styles.mark} aria-hidden="true">✦</span>
            <span><strong>ledgerlens</strong><small>REVENUE INTELLIGENCE</small></span>
          </Link>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>FINANCIAL DETECTIVE</span>
            <h1 id="login-title">Welcome back.</h1>
            <p>Sign in to review billing evidence and continue your investigations.</p>
          </div>
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor="username">Username</label>
            <input id="username" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            <label htmlFor="openai-api-key">Your OpenAI API key</label>
            <div className={styles.secretField}>
              <input id="openai-api-key" name="openai-api-key" type={showApiKey ? "text" : "password"} autoComplete="off" autoCapitalize="none" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" required />
              <button type="button" className={styles.revealButton} onClick={() => setShowApiKey((visible) => !visible)} aria-label={showApiKey ? "Hide API key" : "Show API key"}>{showApiKey ? "Hide" : "Show"}</button>
            </div>
            <p className={styles.keyPrivacy}>Held in this tab’s memory and sent to the agent for each request. LedgerLens does not save it.</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in…" : "Continue securely"}<span aria-hidden="true">→</span>
            </button>
          </form>
          {demoCredentials && (
            <aside className={styles.demo} aria-label="Development login credentials">
              <div><span className={styles.demoDot} /><strong>Demo access</strong><span className={styles.devOnly}>DEV ACCESS</span></div>
              <p>Use these development credentials to explore the sample workspace.</p>
              <dl><div><dt>Username</dt><dd>{demoCredentials.username}</dd></div><div><dt>Password</dt><dd>{demoCredentials.password}</dd></div></dl>
            </aside>
          )}
          <p className={styles.footer}>Sandbox environment · Sample billing data</p>
        </section>

        <aside className={styles.architecture} aria-labelledby="architecture-title">
          <div className={styles.architectureIntro}>
            <span className={styles.eyebrow}>FINANCIAL DETECTIVE · LANGGRAPH</span>
            <h2 id="architecture-title">Inside an investigation</h2>
            <p>See how tool calls, guardrails, verification, and your approval fit into one agent run.</p>
          </div>
          <ol className={styles.flow} aria-label="AI investigation steps">
            <li className={styles.flowQuestion}>
              <span className={styles.flowIndex}>01</span>
              <strong>Your question</strong>
              <small>Plan, invoice, or action</small>
            </li>
            <li className={styles.flowInput}>
              <span className={styles.flowIndex}>02</span>
              <strong>Input guardrails</strong>
              <small>Block injection; redact PII</small>
            </li>
            <li className={styles.flowAgent}>
              <span className={styles.flowIndex}>03</span>
              <strong>Agent node</strong>
              <small>OpenAI chooses a tool or answer</small>
            </li>
          </ol>
          <div className={styles.agentPaths}>
            <section className={styles.loopDiagram} aria-labelledby="tool-loop-title">
              <div className={styles.sectionHeading}>
                <span className={styles.loopLabel}>READ + DRAFT PATH</span>
                <strong id="tool-loop-title">Agent ↔ ToolNode</strong>
              </div>
              <div className={styles.loopNodes}>
                <div className={styles.loopNode}><strong>Agent</strong><small>chooses a tool call</small></div>
                <div className={styles.loopArrows} aria-label="Tool call goes out; result returns">
                  <span>tool call <b aria-hidden="true">→</b></span>
                  <span><b aria-hidden="true">←</b> result</span>
                </div>
                <div className={styles.loopNode}><strong>ToolNode</strong><small>runs the tool</small></div>
              </div>
              <div className={styles.toolGroups}>
                <p><strong>Read</strong><span><code>load_plan</code><code>query_invoices</code><code>fx_convert</code></span></p>
                <p><strong>Draft only</strong><span><code>propose_make_good_invoice</code><code>propose_credit_memo</code><code>propose_plan_amendment</code></span></p>
              </div>
              <p className={styles.pathNote}>Results return to the model for another step. Tool calls and outcomes are logged in chat.</p>
              <p className={styles.guardrailNote}><strong>LoopGuardrail:</strong> caps the run at 8 agent steps, blocks repeated calls, then routes to a safe fallback.</p>
            </section>
            <section className={styles.approvalFlow} aria-labelledby="write-gate-title">
              <span className={styles.approvalGlyph} aria-hidden="true">Ⅱ</span>
              <div className={styles.writeContent}>
                <span className={styles.loopLabel}>WRITE PATH · HUMAN APPROVAL REQUIRED</span>
                <strong id="write-gate-title">apply(draft) or rollback(action_id)</strong>
                <p><code>ApprovalPolicyGuardrail</code> catches either write → LangGraph <code>interrupt()</code> pauses and shows the action in chat.</p>
                <div className={styles.approvalOutcomes}>
                  <p><strong>Approve</strong><span><code>Command(resume)</code> continues; ToolNode runs the write.</span></p>
                  <p><strong>Reject</strong><span>Graph ends; the write tool never runs.</span></p>
                </div>
                <p className={styles.pathNote}>Apply adds the approved draft to the sandbox. Rollback removes that action by ID. Both are written to the audit log.</p>
              </div>
            </section>
          </div>
          <div className={styles.verifyFlow}>
            <span className={styles.verifyMark} aria-hidden="true">✓</span>
            <p><strong>GroundednessGuardrail · before the answer</strong><span>Checks amounts and IDs against tool results. If unsupported, the agent retries once; unsupported claims are withheld.</span></p>
          </div>
          <p className={styles.keyNote}>Your API key powers OpenAI calls and is not saved with chats.</p>
        </aside>
      </div>
    </main>
  );
}
