import Groq, { toFile } from "groq-sdk";
import { SessionSettings, Suggestion } from "./types";
import { randomId } from "./utils";

const TRANSCRIPTION_MODEL = "whisper-large-v3";
const LLM_MODEL = "openai/gpt-oss-120b";

const VALID_SUGGESTION_TYPES = [
  "question",
  "talking_point",
  "answer",
  "fact_check",
  "clarification",
] as const;

type SuggestionType = (typeof VALID_SUGGESTION_TYPES)[number];

interface GenerateSuggestionsParams {
  apiKey: string;
  recentTranscript: string;
  fullTranscript: string;
  settings: SessionSettings;
  recentSuggestionPreviews?: string[];
}


function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeKey(text: string): string {
  return normalizeText(text).toLowerCase();
}

function guessAudioExtension(mimeType: string): string {
  const cleaned = mimeType.split(";")[0].trim().toLowerCase();
  switch (cleaned) {
    case "audio/webm": return "webm";
    case "audio/wav": return "wav";
    case "audio/mpeg": return "mp3";
    case "audio/mp4":
    case "audio/m4a": return "m4a";
    case "audio/ogg": return "ogg";
    case "audio/flac": return "flac";
    default: return "webm";
  }
}

function validateSuggestionType(type: unknown): SuggestionType {
  return VALID_SUGGESTION_TYPES.includes(type as SuggestionType)
    ? (type as SuggestionType)
    : "talking_point";
}


function normalizeSuggestions(
  input: unknown,
  recentSuggestionPreviews: string[] = []
): Array<{ type: SuggestionType; preview: string }> {
  const seen = new Set(recentSuggestionPreviews.map(normalizeKey));
  const cleaned: Array<{ type: SuggestionType; preview: string }> = [];

  if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;

      const preview = normalizeText((item as any).preview || "");
      if (!preview) continue;

      const key = normalizeKey(preview);
      if (seen.has(key)) continue;
      if (cleaned.some((c) => normalizeKey(c.preview) === key)) continue;

      cleaned.push({
        type: validateSuggestionType((item as any).type),
        preview,
      });
    }
  }

  while (cleaned.length < 3) {
    cleaned.push({
      type: "talking_point",
      preview: "Summarize the key takeaway from the latest discussion.",
    });
  }

  return cleaned.slice(0, 3);
}


export async function transcribeAudioChunk(
  apiKey: string,
  audioBuffer: Buffer,
  mimeType: string = "audio/webm"
): Promise<string> {
  const groq = new Groq({ apiKey });
  const file = await toFile(audioBuffer, `chunk.${guessAudioExtension(mimeType)}`);

  const response = await groq.audio.transcriptions.create({
    file,
    model: TRANSCRIPTION_MODEL,
    response_format: "text",
    language: "en",
    temperature: 0,
  });

  const text = typeof response === "string"? response: (response as any)?.text;
  return typeof text === "string" ? text.trim() : "";
}


export async function generateSuggestions({
  apiKey,
  recentTranscript,
  fullTranscript,
  settings,
  recentSuggestionPreviews = [],
}: GenerateSuggestionsParams): Promise<Suggestion[]> {
  const groq = new Groq({ apiKey });

  const recentContext = normalizeText(recentTranscript);
  const fullContext = normalizeText(fullTranscript);

  const avoidList =
    recentSuggestionPreviews.length > 0
      ? recentSuggestionPreviews.map((p) => `- ${normalizeText(p)}`).join("\n")
      : "(none)";

  const userContent = `
You are a live meeting copilot.

## Recent conversation (last ~30s)
${recentContext || "(No transcript yet)"}

## Broader context
${fullContext || "(No transcript yet)"}

## Avoid repeating
${avoidList}

Your job is to generate the 3 MOST USEFUL next actions.

THINK:
- Is someone asking a question?
- Is there confusion?
- Is a decision being made?
- Is there a claim to verify?

RULES:
- Return ONLY JSON
- Exactly 3 suggestions
- Each must be DIFFERENT in intent
- Do not repeat or paraphrase previous suggestions

TYPE LOGIC:
- If a question was asked → include an "answer"
- If unclear → include "clarification"
- If claim → include "fact_check"
- Otherwise prioritize:
  - sharp question
  - useful insight
  - actionable next step

FORMAT:
{
  "suggestions": [
    { "type": "...", "preview": "..." },
    { "type": "...", "preview": "..." },
    { "type": "...", "preview": "..." }
  ]
}
`;

  const response = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: settings.suggestionPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    max_tokens: 700,
    response_format: { type: "json_object" },
  });

  let parsed: any = {};
  try {
    parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
  } catch {}

  const normalized = normalizeSuggestions(parsed?.suggestions, recentSuggestionPreviews);

  return normalized.map((s) => ({
    id: randomId(),
    type: s.type,
    preview: s.preview,
    timestamp: Date.now(),
  }));
}


export async function generateClickedAnswer(
  apiKey: string,
  suggestionPreview: string,
  fullTranscript: string,
  settings: SessionSettings
): Promise<string> {
  const groq = new Groq({ apiKey });

  const response = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: "system", content: settings.clickedAnswerPrompt },
      {
        role: "user",
        content: `
Transcript:
${normalizeText(fullTranscript)}

Suggestion:
"${normalizeText(suggestionPreview)}"

Expand this into a detailed, practical answer. Do not repeat the preview.`,
      },
    ],
    temperature: 0.4,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}


export async function* streamChatResponse(
  apiKey: string,
  userMessage: string,
  chatHistory: Array<{ role: "user" | "assistant"; content: string }>,
  fullTranscript: string,
  settings: SessionSettings
): AsyncGenerator<string> {
  const groq = new Groq({ apiKey });

  const messages = [
    {
      role: "system",
      content: `${settings.chatPrompt}\n\nTranscript:\n${normalizeText(fullTranscript)}`,
    },
    ...chatHistory.slice(-20),
    { role: "user", content: userMessage },
  ];

  const stream = await groq.chat.completions.create({
    model: LLM_MODEL,
    messages,
    temperature: 0.6,
    max_tokens: 1200,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export { TRANSCRIPTION_MODEL, LLM_MODEL };