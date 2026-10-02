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
            <span className={styles.eyebrow}>A CLEAR PATH FROM QUESTION TO EVIDENCE</span>
            <h2 id="architecture-title">How LedgerLens works</h2>
            <p>Your request moves through a guarded agent. Billing changes pause for your approval.</p>
          </div>
          <ol className={styles.flow} aria-label="Request processing flow">
            <li className={styles.flowBrowser}>
              <span className={styles.flowIndex}>01</span>
              <strong>Your browser</strong>
              <small>Chat and your API key in tab memory</small>
            </li>
            <li className={styles.flowNext}>
              <span className={styles.flowIndex}>02</span>
              <strong>Next.js server</strong>
              <small>Login session and request proxy</small>
            </li>
            <li className={styles.flowAgent}>
              <span className={styles.flowIndex}>03</span>
              <strong>FastAPI agent</strong>
              <small>LangGraph tools and guardrails</small>
            </li>
            <li className={styles.flowModel}>
              <span className={styles.flowIndex}>04</span>
              <strong>OpenAI</strong>
              <small>Reasoning with your supplied key</small>
            </li>
          </ol>
          <div className={styles.connectedData} aria-label="Agent data connections">
            <div><span className={styles.dataGlyph} aria-hidden="true">▤</span><span><strong>Billing records</strong><small>Plans, invoices and FX fixtures</small></span></div>
            <span className={styles.dataJoin} aria-hidden="true">↔</span>
            <div><span className={styles.dataGlyph} aria-hidden="true">◷</span><span><strong>PostgreSQL</strong><small>Chats and graph checkpoints</small></span></div>
          </div>
          <div className={styles.approvalFlow}>
            <span className={styles.approvalGlyph} aria-hidden="true">✓</span>
            <p><strong>Human approval stays in the loop</strong><span>For a write, the agent pauses → you approve or reject → the graph resumes.</span></p>
          </div>
          <p className={styles.keyNote}>Your key is sent with requests to the app server and agent. It is never saved in chat history.</p>
        </aside>
      </div>
    </main>
  );
}
