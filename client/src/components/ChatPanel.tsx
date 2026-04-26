import { useEffect, useRef, useState, KeyboardEvent } from "react";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { ChatMessage, Suggestion } from "../types";
import { formatTimestamp } from "../lib/export";

interface Props {
  messages: ChatMessage[];
  onSendMessage: (content: string) => void;
  isStreaming: boolean;
}

export function ChatPanel({ messages, onSendMessage, isStreaming }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    setInput("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="panel chat-panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-number">3.</span> CHAT (DETAILED ANSWERS)
        </div>
        <span className="session-badge">SESSION-ONLY</span>
      </div>

      {messages.length === 0 && (
        <div className="chat-empty">
          <p>
            Clicking a suggestion adds it to this chat and streams a detailed answer
            (separate prompt, more context). User can also type questions directly.
            One continuous chat per session — no login, no persistence.
          </p>
          <p className="empty-hint">Click a suggestion or type a question below.</p>
        </div>
      )}

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-message chat-message--${msg.role}`}>
            <div className="message-meta">
              <span className="message-role">{msg.role === "user" ? "You" : "Assistant"}</span>
              <span className="message-time">{formatTimestamp(msg.timestamp)}</span>
            </div>
            <div className="message-content">
              {msg.role === "assistant" ? (
                <ReactMarkdown>{msg.content || "…"}</ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
              {msg.streaming && <span className="cursor-blink">▋</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything…"
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          title="Send (Enter)"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
