import { Suggestion } from "../types";

const TYPE_CONFIG: Record<
  Suggestion["type"],
  { label: string; color: string; bg: string }
> = {
  question: { label: "Question", color: "#60a5fa", bg: "rgba(96,165,250,0.1)" },
  talking_point: { label: "Talking Point", color: "#34d399", bg: "rgba(52,211,153,0.1)" },
  answer: { label: "Answer", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  fact_check: { label: "Fact Check", color: "#fbbf24", bg: "rgba(251,191,36,0.1)" },
  clarification: { label: "Clarification", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
};

interface Props {
  suggestion: Suggestion;
  onClick: (suggestion: Suggestion) => void;
  isNew?: boolean;
}

export function SuggestionCard({ suggestion, onClick, isNew }: Props) {
  const cfg = TYPE_CONFIG[suggestion.type] ?? TYPE_CONFIG.talking_point;

  return (
    <button
      className={`suggestion-card ${isNew ? "suggestion-card--new" : ""}`}
      onClick={() => onClick(suggestion)}
      title="Click for a detailed answer"
    >
      <span
        className="suggestion-type-badge"
        style={{ color: cfg.color, backgroundColor: cfg.bg }}
      >
        {cfg.label}
      </span>
      <p className="suggestion-preview">{suggestion.preview}</p>
    </button>
  );
}
