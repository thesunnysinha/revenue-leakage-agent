import styles from "./Chat.module.css";

interface Props {
  details?: Record<string, unknown> | null;
  busy?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ApprovalCard({ details, busy = false, onApprove, onReject }: Props) {
  const calls = Array.isArray(details?.calls) ? details.calls : [];
  const firstCall = asRecord(calls[0]);
  const args = asRecord(firstCall?.args);
  const draft = asRecord(args?.draft) ?? args ?? {};
  const actionType = typeof draft.action_type === "string" ? formatLabel(draft.action_type) : typeof firstCall?.tool === "string" ? formatLabel(firstCall.tool) : "Sandbox update";
  const reasonList = Array.isArray(details?.reasons) ? details.reasons.filter((reason): reason is string => typeof reason === "string") : [];
  const amount = typeof draft.amount === "string" || typeof draft.amount === "number" ? `${draft.currency ?? ""} ${Number(draft.amount).toLocaleString()}`.trim() : null;

  const facts = [
    ["Action", actionType],
    ["Plan", typeof draft.plan_id === "string" ? draft.plan_id : null],
    ["Invoice", typeof draft.invoice_id === "string" ? draft.invoice_id : null],
    ["Amount", amount],
    ["Reason", typeof draft.reason === "string" ? draft.reason : null],
    ...(typeof draft.change_set === "object" && draft.change_set ? [["Proposed changes", JSON.stringify(draft.change_set)]] : []),
  ].filter((fact): fact is [string, string] => typeof fact[1] === "string");

  return (
    <section className={styles.approvalCard} aria-labelledby="approval-title">
      <div className={styles.approvalTop}><span className={styles.approvalIcon}><svg viewBox="0 0 24 24"><path d="M12 3 21 19H3L12 3Z" /><path d="M12 9v4m0 3h.01" /></svg></span><div><span className={styles.approvalEyebrow}>REVIEW REQUIRED</span><h3 id="approval-title">Approve this sandbox action?</h3></div></div>
      <p className={styles.approvalIntro}>Review the proposed change. Nothing is written until you approve it.</p>
      {facts.length > 0 && <dl className={styles.approvalFacts}>{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      {reasonList.length > 0 && <ul className={styles.approvalReasons}>{reasonList.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
      <div className={styles.approvalActions}><button className={styles.rejectButton} onClick={onReject} disabled={busy}>Reject</button><button className={styles.approveButton} onClick={onApprove} disabled={busy}><span>{busy ? "Saving decision…" : "Approve and apply"}</span><svg viewBox="0 0 20 20"><path d="m4 10 4 4 8-8" /></svg></button></div>
      <div className={styles.approvalFootnote}><span>⌑</span> Recorded in the sandbox audit log</div>
    </section>
  );
}
