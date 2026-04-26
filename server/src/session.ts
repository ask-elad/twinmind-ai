import WebSocket from "ws";
import {
  SessionState,
  ClientMessage,
  ServerMessage,
  SuggestionBatch,
  ChatMessage,
  TranscriptChunk,
  DEFAULT_SETTINGS,
} from "./types";
import {
  transcribeAudioChunk,
  generateSuggestions,
  generateClickedAnswer,
  streamChatResponse,
} from "./groq";
import { randomId, buildFullTranscript, log } from "./utils";


const SUGGESTION_CONTEXT_WINDOW_MS = 30_000;
const MAX_RECENT_SUGGESTION_PREVIEWS = 12;


function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildRecentTranscriptChunks(chunks: TranscriptChunk[]): TranscriptChunk[] {
  if (chunks.length === 0) return [];

  const latestTimestamp = chunks[chunks.length - 1].timestamp;
  const cutoff = latestTimestamp - SUGGESTION_CONTEXT_WINDOW_MS;

  const recent = chunks.filter((c) => c.timestamp >= cutoff);
  return recent.length > 0 ? recent : chunks.slice(-5);
}

function isNoiseTranscript(text: string): boolean {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return true;

  const words = normalized.split(" ");

  if (words.length <= 2) return true;

  if (new Set(words).size === 1) return true;

  const filler = new Set([
    "thank you",
    "thanks",
    "okay",
    "ok",
    "uh",
    "um",
    "hmm",
    "hm",
  ]);

  if (filler.has(normalized)) return true;

  return false;
}


export function createSession(): SessionState {
  return {
    transcript: [],
    suggestionBatches: [],
    chatHistory: [],
    apiKey: "",
    recentSuggestionPreviews: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function handleSession(ws: WebSocket): void {
  const session = createSession();
  let lastSuggestionTime = 0;

  const transcriptionQueue: Buffer[] = [];
  let transcribing = false;
  let isGeneratingSuggestions = false;

  function send(msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }


  async function drainTranscriptionQueue(): Promise<void> {
    if (transcribing) return;
    transcribing = true;

    while (transcriptionQueue.length > 0) {
      const audioBuffer = transcriptionQueue.shift()!;

      if (audioBuffer.length < 3000) continue;

      send({ type: "status", status: "transcribing" });

      try {
        const text = await transcribeAudioChunk(
          session.apiKey,
          audioBuffer,
          "audio/webm"
        );

        const cleaned = normalizeText(text);
        const last = session.transcript[session.transcript.length - 1]?.text.toLowerCase();

        if (!cleaned || isNoiseTranscript(cleaned) || cleaned.toLowerCase() === last) {
          continue;
        }

        const chunk: TranscriptChunk = {
          id: randomId(),
          text: cleaned,
          timestamp: Date.now(),
        };

        session.transcript.push(chunk);
        send({ type: "transcript_chunk", chunk });

        triggerSuggestions();

      } catch (err) {
        log("error", "Transcription failed", err);
      }
    }

    transcribing = false;
    send({ type: "status", status: "idle" });
  }

  function enqueueAudioChunk(base64Audio: string): void {
    if (!session.apiKey) {
      send({ type: "error", message: "No API key configured." });
      return;
    }

    const audioBuffer = Buffer.from(base64Audio, "base64");
    transcriptionQueue.push(audioBuffer);

    drainTranscriptionQueue().catch((err) => {
      log("error", "Queue error", err);
      transcribing = false;
    });
  }


  function triggerSuggestions() {
    const now = Date.now();

    if (now - lastSuggestionTime < 30000) return;

    if (isGeneratingSuggestions) return;

    lastSuggestionTime = now;

    refreshSuggestions().catch((err) => {
      log("error", "Suggestion trigger failed", err);
    });
  }

  async function refreshSuggestions(): Promise<void> {
    if (!session.apiKey) return;
    if (session.transcript.length === 0) return;
    if (isGeneratingSuggestions) return;

    isGeneratingSuggestions = true;

    try {
      const recentChunks = buildRecentTranscriptChunks(session.transcript);

      const recentTranscript = recentChunks
        .map((c) => normalizeText(c.text))
        .filter(Boolean)
        .join("\n");

      const fullTranscript = session.transcript
        .map((c) => normalizeText(c.text))
        .filter(Boolean)
        .join("\n");

      const recentSuggestionPreviews =
        session.recentSuggestionPreviews.slice(-MAX_RECENT_SUGGESTION_PREVIEWS);

      const suggestions = await generateSuggestions({
        apiKey: session.apiKey,
        recentTranscript,
        fullTranscript,
        settings: session.settings,
        recentSuggestionPreviews,
      });

      const batch: SuggestionBatch = {
        id: randomId(),
        suggestions,
        timestamp: Date.now(),
        transcriptSnapshotLength: fullTranscript.length,
      };

      session.suggestionBatches.unshift(batch);

      session.recentSuggestionPreviews = [
        ...session.recentSuggestionPreviews,
        ...suggestions.map((s) => s.preview),
      ].slice(-MAX_RECENT_SUGGESTION_PREVIEWS);

      send({ type: "suggestion_batch", batch });

    } catch (err) {
      log("error", "Suggestion generation failed", err);
    } finally {
      isGeneratingSuggestions = false;
    }
  }

  async function handleChatMessage(
    content: string,
    suggestionId?: string,
    suggestionPreview?: string
  ): Promise<void> {
    if (!session.apiKey) return;

    const userMsg: ChatMessage = {
      id: randomId(),
      role: "user",
      content,
      timestamp: Date.now(),
      suggestionId,
    };

    session.chatHistory.push(userMsg);

    const assistantId = randomId();
    const fullTranscript = buildFullTranscript(session.transcript);

    try {
      if (suggestionId && suggestionPreview) {
        const answer = await generateClickedAnswer(
          session.apiKey,
          suggestionPreview,
          fullTranscript,
          session.settings
        );

        for (const word of answer.split(" ")) {
          send({ type: "chat_token", token: word + " ", messageId: assistantId });
          await sleep(8);
        }

        send({ type: "chat_done", messageId: assistantId, fullContent: answer });
      } else {
        let full = "";

        for await (const token of streamChatResponse(
          session.apiKey,
          content,
          session.chatHistory,
          fullTranscript,
          session.settings
        )) {
          full += token;
          send({ type: "chat_token", token, messageId: assistantId });
        }

        send({ type: "chat_done", messageId: assistantId, fullContent: full });
      }
    } catch (err) {
      log("error", "Chat failed", err);
    }
  }


  ws.on("message", async (raw) => {
    let msg: ClientMessage;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send({ type: "error", message: "Invalid message format" });
      return;
    }

    switch (msg.type) {
      case "init":
        session.apiKey = msg.groqApiKey;
        session.settings = { ...DEFAULT_SETTINGS, ...msg.settings };
        break;

      case "audio_chunk":
        enqueueAudioChunk(msg.data);
        break;

      case "refresh_suggestions":
        await refreshSuggestions();
        break;

      case "chat_message":
        await handleChatMessage(msg.content, msg.suggestionId, msg.suggestionPreview);
        break;

      case "update_settings":
        session.settings = { ...session.settings, ...msg.settings };
        break;
    }
  });

  ws.on("close", () => log("info", "Session closed"));
  ws.on("error", (err) => log("error", "WebSocket error", err));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}