import styles from "./Chat.module.css";

function InlineMarkdown({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return <>{tokens.map((token, index) => {
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith("*") && token.endsWith("*")) return <em key={index}>{token.slice(1, -1)}</em>;
    if (token.startsWith("`") && token.endsWith("`")) return <code key={index}>{token.slice(1, -1)}</code>;
    return <span key={index}>{token}</span>;
  })}</>;
}

function RichText({ content }: { content: string }) {
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(/^#{1,4}\s+(.+)$/);
    if (heading) {
      blocks.push(<h3 key={`h-${index}`}><InlineMarkdown text={heading[1]} /></h3>);
      index += 1;
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ol key={`ol-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ol>);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim().match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push(<ul key={`ul-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}><InlineMarkdown text={item} /></li>)}</ul>);
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^#{1,4}\s+|^\d+\.\s+|^[-*]\s+/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(<p key={`p-${index}`}><InlineMarkdown text={paragraph.join(" ")} /></p>);
  }
  return <div className={styles.richText}>{blocks}</div>;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <article className={`${styles.message} ${isUser ? styles.userMessage : styles.agentMessage}`}>
      {isUser ? <span className={styles.messageAvatar}>S</span> : <span className={styles.agentAvatar}><svg viewBox="0 0 24 24"><path d="M12 3.5 14.1 9.9 20.5 12l-6.4 2.1-2.1 6.4-2.1-6.4L3.5 12l6.4-2.1L12 3.5Z" /></svg></span>}
      <div className={styles.messageContent}>
        <div className={styles.messageByline}><strong>{isUser ? "You" : "LedgerLens"}</strong>{!isUser && <span>Financial detective</span>}</div>
        <div className={`${styles.messageText} ledgerlens-markdown`}><RichText content={message.content} /></div>
        {!isUser && message.tools?.length ? <div className={styles.toolEvidence}><span>Evidence checked</span>{message.tools.map((tool) => <span className={styles.toolPill} key={tool}>{tool.replaceAll("_", " ")}</span>)}</div> : null}
      </div>
    </article>
  );
}
