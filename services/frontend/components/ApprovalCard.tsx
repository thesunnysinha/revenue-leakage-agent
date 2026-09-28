interface Props {
  details?: Record<string, unknown> | null;
  onApprove: () => void;
  onReject: () => void;
}

export default function ApprovalCard({ details, onApprove, onReject }: Props) {
  return (
    <div
      style={{
        border: "2px solid #f0ad4e",
        borderRadius: 10,
        padding: "1rem",
        background: "#fffbf0",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <strong>⚠ Approval Required</strong>
      <p style={{ margin: 0, fontSize: 14 }}>
        The agent wants to write to the sandbox. Review and approve or reject below.
      </p>
      {details && (
        <pre
          style={{
            background: "#f9f9f9",
            padding: "0.5rem",
            borderRadius: 6,
            fontSize: 12,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(details, null, 2)}
        </pre>
      )}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={onApprove}
          style={{
            padding: "0.4rem 1rem",
            background: "#28a745",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Approve
        </button>
        <button
          onClick={onReject}
          style={{
            padding: "0.4rem 1rem",
            background: "#dc3545",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Reject
        </button>
      </div>
    </div>
  );
}
