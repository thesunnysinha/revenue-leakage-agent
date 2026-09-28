"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityLog, SandboxActivityEvent, ToolActivityEvent } from "@/lib/api";
import styles from "./WorkspaceViews.module.css";

type ActivityFilter = "all" | "tool_call" | "sandbox";

function when(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function toolEvents(activity: ToolActivityEvent[]) {
  return activity.map((event) => ({
    id: event.event_id,
    kind: "tool_call" as const,
    timestamp: event.timestamp,
    title: event.tool_call.name.replaceAll("_", " "),
    subtitle: event.chat_title,
    status: event.tool_call.status,
    description: event.tool_call.result || "Tool call recorded.",
    detail: { arguments: event.tool_call.arguments, session_id: event.session_id },
  }));
}

function sandboxEvents(activity: SandboxActivityEvent[]) {
  return activity.map((event) => {
    const rollback = event.action_type === "rollback";
    const amount = event.details.amount;
    const currency = event.details.currency;
    return {
      id: event.action_id,
      kind: "sandbox" as const,
      timestamp: event.applied_at,
      title: rollback ? "Sandbox action rolled back" : `${event.action_type.replaceAll("_", " ")} applied`,
      subtitle: event.plan_id || "Sandbox ledger",
      status: rollback ? "rolled back" : "applied",
      description: [typeof amount === "string" || typeof amount === "number" ? `${amount} ${typeof currency === "string" ? currency : ""}`.trim() : "", typeof event.details.reason === "string" ? event.details.reason : ""].filter(Boolean).join(" · ") || event.action_id,
      detail: event.details,
    };
  });
}

export default function ActivityLogView() {
  const [data, setData] = useState<ActivityLog | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await fetch("/api/activity", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load activity history.");
      setData(await response.json() as ActivityLog);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load activity history.");
    }
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/activity", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load activity history.");
        return await response.json() as ActivityLog;
      })
      .then((result) => { if (active) setData(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load activity history."); });
    return () => { active = false; };
  }, []);

  const events = useMemo(() => {
    if (!data) return [];
    const all = [...toolEvents(data.tool_calls), ...sandboxEvents(data.sandbox_actions)]
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    const term = search.trim().toLowerCase();
    return all.filter((event) => (filter === "all" || event.kind === filter) && (!term || `${event.title} ${event.subtitle} ${event.description}`.toLowerCase().includes(term)));
  }, [data, filter, search]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeading}>
        <div><span className={styles.eyebrow}>DEMO WORKSPACE / AUDIT TRAIL</span><h1>Activity log</h1><p>Tool calls from saved investigations and sandbox apply/rollback events.</p></div>
        <span className={styles.readOnly}>◉&nbsp; AUDIT VIEW</span>
      </div>
      {error && <div className={styles.error} role="alert"><span>{error}</span><button onClick={() => void load()}>Retry</button></div>}
      {!data && !error && <div className={styles.loading}>Loading recorded activity…</div>}
      {data && <>
        <div className={styles.activitySummary}>
          <div className={styles.statCard}><span>Tool calls</span><strong>{data.tool_calls.length}</strong></div>
          <div className={styles.statCard}><span>Sandbox events</span><strong>{data.sandbox_actions.length}</strong></div>
          <div className={styles.statCard}><span>Source</span><strong className={styles.sourceLabel}>Saved chat + audit ledger</strong></div>
        </div>
        <div className={styles.activityFilters}>
          <div className={styles.filterTabs} role="group" aria-label="Filter activity type">
            {(["all", "tool_call", "sandbox"] as const).map((value) => <button key={value} className={filter === value ? styles.filterActive : ""} onClick={() => setFilter(value)}>{value === "all" ? "All activity" : value === "tool_call" ? "Tool calls" : "Sandbox actions"}</button>)}
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search activity" placeholder="Search activity…" />
        </div>
        <div className={styles.timeline}>
          {events.map((event) => <article className={styles.event} key={event.id}>
            <span className={`${styles.eventMarker} ${event.kind === "sandbox" ? styles.eventMarkerSandbox : ""}`}>{event.kind === "sandbox" ? "↗" : "⌘"}</span>
            <div className={styles.eventBody}>
              <div className={styles.eventTop}><div><strong>{event.title}</strong><span className={styles.eventSubtitle}>{event.subtitle}</span></div><span className={`${styles.eventStatus} ${styles[`event_${event.status.replaceAll(" ", "_")}`]}`}>{event.status.replaceAll("_", " ")}</span></div>
              <p>{event.description}</p>
              <time dateTime={event.timestamp}>{when(event.timestamp)}</time>
              <details className={styles.eventDetails}><summary>View event details</summary><pre>{JSON.stringify(event.detail, null, 2)}</pre></details>
            </div>
          </article>)}
          {events.length === 0 && <div className={styles.empty}>No activity matches this filter.</div>}
        </div>
      </>}
    </div>
  );
}
