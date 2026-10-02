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
            <span className={styles.eyebrow}>THE AI INVESTIGATION LOOP</span>
            <h2 id="architecture-title">How the AI investigates</h2>
            <p>LangGraph runs a tool-use loop: the model gathers billing evidence, checks its findings, and answers with support.</p>
          </div>
          <ol className={styles.flow} aria-label="AI investigation steps">
            <li className={styles.flowQuestion}>
              <span className={styles.flowIndex}>01</span>
              <strong>Question</strong>
              <small>Ask about a plan or invoice</small>
            </li>
            <li className={styles.flowReason}>
              <span className={styles.flowIndex}>02</span>
              <strong>Agent reasoning</strong>
              <small>OpenAI chooses a next step</small>
            </li>
            <li className={styles.flowVerify}>
              <span className={styles.flowIndex}>03</span>
              <strong>Verify &amp; answer</strong>
              <small>Grounds numbers; retries once if needed</small>
            </li>
          </ol>
          <div className={styles.loopDiagram} aria-label="Agent and tool reasoning loop">
            <span className={styles.loopLabel}>REASONING LOOP</span>
            <div className={styles.loopNodes}>
              <div className={styles.loopNode}><strong>Agent</strong><small>chooses a tool</small></div>
              <div className={styles.loopArrows} aria-label="Tool call goes out; evidence returns">
                <span>tool call <b aria-hidden="true">→</b></span>
                <span><b aria-hidden="true">←</b> evidence</span>
              </div>
              <div className={styles.loopNode}><strong>Billing tool</strong><small>reads records</small></div>
            </div>
            <p>Evidence returns to the agent. It can repeat with another tool until ready to answer; a loop guard stops repeats.</p>
          </div>
          <div className={styles.approvalFlow}>
            <span className={styles.approvalGlyph} aria-hidden="true">Ⅱ</span>
            <p><strong>Write actions pause for you</strong><span>Draft a correction → agent pauses → you approve or reject → only approval can apply it to the sandbox.</span></p>
          </div>
          <p className={styles.keyNote}>Your API key powers the OpenAI reasoning calls and is not saved with chats.</p>
        </aside>
      </div>
    </main>
  );
}
