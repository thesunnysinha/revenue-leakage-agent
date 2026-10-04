"use client";

import Link from "next/link";
import styles from "./LoginForm.module.css";

const ERRORS: Record<string, string> = {
  denied: "GitHub sign-in was cancelled.",
  state: "Sign-in session expired. Please try again.",
  github: "Could not complete sign-in with GitHub.",
};

export default function LoginForm({ configured, error }: { configured: boolean; error?: string }) {
  const message = !configured
    ? "GitHub sign-in is not configured on this server."
    : error ? (ERRORS[error] ?? "Could not sign in.") : "";

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
            <p>Sign in with GitHub to review billing evidence and continue your investigations.</p>
          </div>
          <div className={styles.form}>
            {message && <p className={styles.error} role="alert">{message}</p>}
            {configured && (
              <a className={styles.githubButton} href="/api/auth/github">Continue with GitHub<span aria-hidden="true">→</span></a>
            )}
            <p className={styles.keyPrivacy}>You will enter your OpenAI API key next. It is held in this tab’s memory and sent to the agent for each request. LedgerLens does not save it.</p>
          </div>
          <p className={styles.footer}>
            <span>Sandbox environment · Sample billing data</span>
            <a href="https://github.com/thesunnysinha/revenue-leakage-agent" target="_blank" rel="noopener noreferrer">
              View on GitHub <span aria-hidden="true">↗</span>
            </a>
          </p>
        </section>

        <aside className={styles.architecture} aria-labelledby="architecture-title">
          <div className={styles.architectureIntro}>
            <span className={styles.eyebrow}>Financial detective · LangGraph</span>
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
                <span className={styles.loopLabel}>Read and draft tools</span>
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
                <span className={styles.loopLabel}>Write path · approval required</span>
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
