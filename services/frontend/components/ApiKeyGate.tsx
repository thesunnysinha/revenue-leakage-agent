"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useChatStore } from "@/store/chat";
import styles from "./ApiKeyGate.module.css";

export default function ApiKeyGate() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = apiKey.trim();
    if (!key) {
      setError("Enter your OpenAI API key to continue.");
      return;
    }
    useChatStore.getState().setOpenaiApiKey(key);
  }

  async function signOut() {
    setSigningOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      const store = useChatStore.getState();
      store.resetSession();
      store.setChats([]);
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="key-title">
        <span className={styles.mark} aria-hidden="true">✦</span>
        <span className={styles.eyebrow}>ONE MORE STEP</span>
        <h1 id="key-title">Reconnect your OpenAI key</h1>
        <p className={styles.lede}>Your key is kept in this tab’s memory only. Enter it again after a refresh to continue your investigation.</p>
        <form onSubmit={connect}>
          <label htmlFor="reconnect-api-key">OpenAI API key</label>
          <div className={styles.secretField}>
            <input id="reconnect-api-key" type={showKey ? "text" : "password"} autoComplete="off" autoCapitalize="none" spellCheck={false} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-…" required />
            <button type="button" onClick={() => setShowKey((show) => !show)} aria-label={showKey ? "Hide API key" : "Show API key"}>{showKey ? "Hide" : "Show"}</button>
          </div>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button className={styles.submit} type="submit">Continue to LedgerLens <span aria-hidden="true">→</span></button>
        </form>
        <div className={styles.privacy}>
          <strong>Private to this tab</strong>
          <p>The key is not written to browser storage, chat history, logs, or the database. It is sent to the agent service only with your requests, and is not shared with other visitors.</p>
        </div>
        <button className={styles.signOut} type="button" onClick={() => void signOut()} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </main>
  );
}
