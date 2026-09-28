"use client";
import { useState } from "react";
import { sendMessage, sendApproval, type ChatResponse } from "@/lib/api";
import MessageBubble, { type Message } from "./MessageBubble";
import ApprovalCard from "./ApprovalCard";

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addMessage(role: "user" | "assistant", content: string, tools?: string[]) {
    setMessages((prev) => [
      ...prev,
      { role, content, tools, id: `${Date.now()}-${Math.random()}` },
    ]);
  }

  async function handleSend() {
    if (!input.trim() || loading) return;
    const query = input.trim();
    setInput("");
    setError(null);
    addMessage("user", query);
    setLoading(true);
    try {
      const res = await sendMessage(query, sessionId);
      setSessionId(res.session_id);
      addMessage("assistant", res.response, res.tools_executed);
      if (res.requires_human_approval) {
        setPendingApproval(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved: boolean) {
    if (!sessionId) return;
    setPendingApproval(null);
    setLoading(true);
    try {
      const res = await sendApproval(sessionId, approved);
      addMessage("assistant", res.response, res.tools_executed);
      if (res.requires_human_approval) setPendingApproval(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        maxWidth: 800,
        margin: "0 auto",
        padding: "1rem",
      }}
    >
      <h2 style={{ textAlign: "center", marginBottom: "0.5rem" }}>Revenue Leakage Agent</h2>

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          paddingBottom: "0.5rem",
        }}
      >
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {pendingApproval && (
          <ApprovalCard
            details={pendingApproval.pending_approval_details}
            onApprove={() => handleApproval(true)}
            onReject={() => handleApproval(false)}
          />
        )}

        {loading && (
          <div style={{ color: "#888", fontSize: 13 }}>Agent is thinking…</div>
        )}

        {error && (
          <div
            style={{
              color: "red",
              background: "#fff0f0",
              padding: "0.5rem",
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {error}{" "}
            <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>
              ×
            </button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", paddingTop: "0.75rem" }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={loading || !!pendingApproval}
          placeholder={
            pendingApproval
              ? "Waiting for your approval above…"
              : "Ask about billing plans or revenue leakage…"
          }
          style={{
            flex: 1,
            padding: "0.5rem",
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !!pendingApproval}
          style={{
            padding: "0.5rem 1rem",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
