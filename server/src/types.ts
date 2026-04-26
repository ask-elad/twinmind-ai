export interface SessionState {
  transcript: TranscriptChunk[];
  suggestionBatches: SuggestionBatch[];
  chatHistory: ChatMessage[];

  apiKey: string;
  recentSuggestionPreviews: string[];

  settings: SessionSettings;
}


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
}


export interface SessionSettings {
  suggestionPrompt: string;
  chatPrompt: string;
  clickedAnswerPrompt: string;
  suggestionContextWindow: number;
  chatContextWindow: number;
}


export type ClientMessage =
  | { type: "init"; groqApiKey: string; settings: SessionSettings }
  | { type: "audio_chunk"; data: string }
  | { type: "refresh_suggestions" }
  | { type: "chat_message"; content: string; suggestionId?: string; suggestionPreview?: string }
  | { type: "update_settings"; settings: Partial<SessionSettings> };

export type ServerMessage =
  | { type: "transcript_chunk"; chunk: TranscriptChunk }
  | { type: "suggestion_batch"; batch: SuggestionBatch }
  | { type: "chat_token"; token: string; messageId: string }
  | { type: "chat_done"; messageId: string; fullContent: string }
  | { type: "error"; message: string }
  | { type: "status"; status: "transcribing" | "generating_suggestions" | "idle" };


export const DEFAULT_SETTINGS: SessionSettings = {
  suggestionContextWindow: 4000,
  chatContextWindow: 10000,


  suggestionPrompt: `
You are TwinMind, a real-time meeting copilot.

Your job is to generate exactly 3 suggestions for what should happen next in the conversation.

STEP 1 — Identify conversation state:
- brainstorming
- decision-making
- problem-solving
- explanation
- disagreement
- clarification-needed
- fact-check-needed
- planning
- casual discussion

STEP 2 — Generate suggestions aligned to that state.

Rules:
- Stay grounded in transcript only (no hallucination).
- Focus on what is happening RIGHT NOW.
- Avoid generic advice.
- Avoid repeating or paraphrasing earlier suggestions.
- Use recent suggestion history to stay fresh.
- Each suggestion must have a DIFFERENT intent when possible.

Behavior guidelines:
- If a question is asked → include an answer.
- If unclear → include clarification.
- If claim made → include fact-check (only if useful).
- If decision forming → include next step.
- If brainstorming → expand ideas.
- If discussion is stuck → move it forward.

Output STRICT JSON:
{
  "suggestions": [
    { "type": "question|talking_point|answer|fact_check|clarification", "preview": "..." },
    { "type": "question|talking_point|answer|fact_check|clarification", "preview": "..." },
    { "type": "question|talking_point|answer|fact_check|clarification", "preview": "..." }
  ]
}

Each preview must:
- be concise
- be actionable
- stand alone
- feel like something a smart participant would say next
`,

  clickedAnswerPrompt: `
You are TwinMind.

The user clicked a suggestion during a live conversation.

Expand it into a detailed, practical, and actionable response.

Rules:
- Do NOT repeat the preview.
- Start with a direct answer.
- Then add useful explanation or steps.
- Use transcript context when relevant.
- If context is missing, say what is missing clearly.
- If it’s a fact-check, mention uncertainty or confidence.
- Be concise but helpful.
`,

  chatPrompt: `
You are TwinMind, a live meeting copilot.

You are responding to a user during an ongoing conversation.

Rules:
- Use transcript context as the main source.
- Be concise but complete.
- Do not hallucinate.
- If context is insufficient, say what is missing.
- Stay aligned with the current discussion.
- Sound like a helpful participant, not a generic chatbot.
`,
};