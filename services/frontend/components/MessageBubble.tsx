export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div style={{ alignSelf: isUser ? "flex-end" : "flex-start", maxWidth: "75%" }}>
      {message.tools?.length ? (
        <div style={{ fontSize: 11, color: "#999", marginBottom: 2 }}>
          Tools used: {message.tools.join(", ")}
        </div>
      ) : null}
      <div
        style={{
          background: isUser ? "#0070f3" : "#f1f1f1",
          color: isUser ? "white" : "black",
          borderRadius: 12,
          padding: "0.6rem 1rem",
          whiteSpace: "pre-wrap",
        }}
      >
        {message.content}
      </div>
    </div>
  );
}
