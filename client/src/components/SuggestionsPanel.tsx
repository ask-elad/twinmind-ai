import { RefreshCw } from "lucide-react";
import { Suggestion, SuggestionBatch } from "../types";
import { SuggestionCard } from "./SuggestionCard";
import { formatTimestamp } from "../lib/export";

interface Props {
  batches: SuggestionBatch[];
  isLoading: boolean;
  onRefresh: () => void;
  onSuggestionClick: (suggestion: Suggestion) => void;
  nextRefreshIn: number; // seconds
}

export function SuggestionsPanel({
  batches,
  isLoading,
  onRefresh,
  onSuggestionClick,
  nextRefreshIn,
}: Props) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-number">2.</span> LIVE SUGGESTIONS
        </div>
        <div className="panel-status-row">
          <span className="batch-count">{batches.length} BATCH{batches.length !== 1 ? "ES" : ""}</span>
        </div>
      </div>

      <div className="suggestions-toolbar">
        <button
          className={`refresh-btn ${isLoading ? "refresh-btn--loading" : ""}`}
          onClick={onRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={13} className={isLoading ? "spin" : ""} />
          {isLoading ? "Generating…" : "↺ Reload suggestions"}
        </button>
        <span className="auto-refresh-hint">
          auto-refresh in {nextRefreshIn}s
        </span>
      </div>

      {batches.length === 0 && !isLoading && (
        <div className="suggestions-empty">
          <div className="suggestions-empty-desc">
            On reload (or auto every ~30s), generate{" "}
            <strong>3 fresh suggestions</strong> from recent transcript context.
            New batch appears at the top; older batches push down (faded). Each
            is a tappable card: a{" "}
            <span className="tag-question">question to ask</span>, a{" "}
            <span className="tag-talking">talking point</span>, an{" "}
            <span className="tag-answer">answer</span>, or a{" "}
            <span className="tag-fact">fact-check</span>. The preview alone
            should already be useful.
          </div>
          <p className="empty-hint">Suggestions appear here once recording starts.</p>
        </div>
      )}

      <div className="suggestions-list">
        {batches.map((batch, batchIdx) => (
          <div
            key={batch.id}
            className={`suggestion-batch ${batchIdx > 0 ? "suggestion-batch--old" : ""}`}
          >
            <div className="batch-meta">
              <span className="batch-timestamp">{formatTimestamp(batch.timestamp)}</span>
              {batchIdx === 0 && <span className="batch-new-badge">NEW</span>}
            </div>
            {batch.suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                onClick={onSuggestionClick}
                isNew={batchIdx === 0}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
