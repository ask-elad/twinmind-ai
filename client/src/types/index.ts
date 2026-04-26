export interface TranscriptChunk {
  id: string;
  text: string;
  timestamp: number;
}

export interface Suggestion {
  id: string;
  type: "question" | "talking_point" | "answer" | "fact_check" | "clarification";
  preview: string;
  detail?: string;
  timestamp: number;
}

export interface SuggestionBatch {
  id: string;
  suggestions: Suggestion[];
  timestamp: number;
  transcriptSnapshotLength: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  suggestionId?: string;
  streaming?: boolean;
}

export interface SessionSettings {
  suggestionPrompt: string;
  chatPrompt: string;
  clickedAnswerPrompt: string;
  suggestionContextWindow: number;
  chatContextWindow: number;
}

// Server → Client messages
export type ServerMessage =
  | { type: "transcript_chunk"; chunk: TranscriptChunk }
  | { type: "suggestion_batch"; batch: SuggestionBatch }
  | { type: "chat_token"; token: string; messageId: string }
  | { type: "chat_done"; messageId: string; fullContent: string }
  | { type: "error"; message: string }
  | { type: "status"; status: "transcribing" | "generating_suggestions" | "idle" };

// Client → Server messages
export type ClientMessage =
  | { type: "init"; groqApiKey: string; settings: SessionSettings }
  | { type: "audio_chunk"; data: string }
  | { type: "refresh_suggestions" }
  | { type: "chat_message"; content: string; suggestionId?: string; suggestionPreview?: string }
  | { type: "update_settings"; settings: Partial<SessionSettings> };

export interface ExportData {
  exportedAt: string;
  transcript: Array<{ timestamp: string; text: string }>;
  suggestionBatches: Array<{
    timestamp: string;
    suggestions: Array<{ type: string; preview: string }>;
  }>;
  chatHistory: Array<{ timestamp: string; role: string; content: string }>;
}
