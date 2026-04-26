import { TranscriptChunk, SuggestionBatch, ChatMessage, ExportData } from "../types";

export function buildExportData(
  transcript: TranscriptChunk[],
  suggestionBatches: SuggestionBatch[],
  chatHistory: ChatMessage[]
): ExportData {
  return {
    exportedAt: new Date().toISOString(),
    transcript: transcript.map((c) => ({
      timestamp: new Date(c.timestamp).toISOString(),
      text: c.text,
    })),
    suggestionBatches: suggestionBatches.map((b) => ({
      timestamp: new Date(b.timestamp).toISOString(),
      suggestions: b.suggestions.map((s) => ({
        type: s.type,
        preview: s.preview,
      })),
    })),
    chatHistory: chatHistory.map((m) => ({
      timestamp: new Date(m.timestamp).toISOString(),
      role: m.role,
      content: m.content,
    })),
  };
}

export function downloadExport(data: ExportData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `twinmind-session-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
