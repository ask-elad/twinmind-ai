# TwinMind — Live Suggestions

A real-time AI meeting copilot that listens to live audio, transcribes speech via Whisper, and continuously surfaces three contextual suggestions based on what is being said. Clicking a suggestion opens a detailed answer in a streaming chat panel.

Built as a submission for the TwinMind Full-Stack / Prompt Engineering assignment.

---

## Live Demo

| Service | URL |
|---------|-----|
| Frontend | https://twinmind-ai.vercel.app |
| Backend  | https://twinmind-server-production.up.railway.app/health |

> Requires a [Groq API key](https://console.groq.com) — paste it in the **Customize** panel on first load.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| Backend | Node.js + Express + WebSocket (`ws`) + TypeScript |
| Transcription | Groq — `whisper-large-v3` |
| Suggestions & Chat | Groq — `openai/gpt-oss-120b` |
| Audio capture | Browser `MediaRecorder` → `audio/webm;codecs=opus` |
| Transport | WebSocket (bi-directional, auto-reconnect) |
| Frontend hosting | Vercel |
| Backend hosting | Railway |

---

## Project Structure

```
twinmind-live/
├── client/                        # React frontend (Vite)
│   └── src/
│       ├── App.tsx                # Root component — all session state lives here
│       ├── components/
│       │   ├── TranscriptPanel.tsx    # Left column — mic control + transcript
│       │   ├── SuggestionsPanel.tsx   # Middle column — suggestion batches
│       │   ├── SuggestionCard.tsx     # Individual tappable suggestion card
│       │   ├── ChatPanel.tsx          # Right column — streaming chat
│       │   ├── SettingsModal.tsx      # API key + prompt customisation
│       │   └── ConnectionIndicator.tsx
│       ├── hooks/
│       │   ├── useAudioRecorder.ts    # MediaRecorder rotation, EBML-safe chunking
│       │   ├── useWebSocket.ts        # WS connection with auto-reconnect
│       │   └── useAutoRefresh.ts      # 30s suggestion refresh timer
│       ├── lib/
│       │   ├── constants.ts           # Default prompts, settings, WS URL resolver
│       │   └── export.ts              # JSON session export + timestamp formatting
│       └── types/
│           └── index.ts               # Shared TypeScript interfaces + WS message types
└── server/                        # Express + WebSocket backend
    └── src/
        ├── index.ts               # HTTP + WS server entrypoint
        ├── session.ts             # Per-connection session handler + message router
        ├── groq.ts                # Groq API: transcription, suggestions, chat streaming
        ├── types.ts               # Shared types, session state, default settings
        └── utils.ts               # ID generation, transcript builder, structured logger
```

---

## Features

### Mic & Transcript (left column)
- Start/stop microphone with a single button
- Audio is chunked every 5 seconds using MediaRecorder rotation — each chunk is a fully self-contained WebM file with a valid EBML header, accepted cleanly by Whisper
- Noise and hallucination filtering: transcripts under 3 words, pure filler words (`uh`, `hmm`, `okay`), and exact duplicates are silently discarded before they reach the suggestion pipeline
- Transcript auto-scrolls to the latest line

### Live Suggestions (middle column)
- Three suggestions are generated automatically every 30 seconds while recording is active
- A manual **Reload suggestions** button flushes the latest audio first, then triggers generation immediately
- Each new batch appears at the top; older batches remain visible below (faded)
- A deduplication list of recent suggestion previews is passed to the model on every call — suggestions do not repeat across refresh cycles
- Each card shows a type badge (`question`, `talking_point`, `answer`, `fact_check`, `clarification`) and a self-contained preview that is useful without clicking

### Chat (right column)
- Clicking a suggestion adds it to chat and returns a detailed, long-form answer using the full transcript as context
- Free-form questions can be typed directly at any time
- Free-form chat uses real Groq SSE token streaming
- Markdown rendering for assistant responses
- One continuous chat per session — no login, no persistence

### Export
- The **Export** button (↓) downloads a timestamped JSON file containing the full transcript, every suggestion batch, and the complete chat history

### Settings
- API key input — stored in `localStorage`, never sent to the server except as a bearer credential on each Groq request
- All prompts are editable at runtime: suggestion prompt, clicked-answer prompt, chat prompt
- Context window sizes are configurable: suggestion context (default 3,000 chars) and chat context (default 8,000 chars)

---

## Prompt Strategy

### Suggestion prompt — two-layer architecture

The suggestion pipeline uses two distinct messages per call rather than a single monolithic prompt.

The **system message** establishes the model's identity and standing rules: it defines the five suggestion types, sets the precedence logic (a direct question in the transcript always yields an `answer` suggestion first), and prohibits generic or hallucinated content.

The **user message** delivers the structured context for this specific refresh cycle:

```
## Recent conversation (last ~30s)
<recentTranscript>

## Broader context
<fullTranscript>

## Avoid repeating
<recentSuggestionPreviews>

THINK:
- Is someone asking a question?
- Is there confusion?
- Is a decision being made?
- Is there a claim to verify?
```

The `THINK` block is deliberate — it prompts the model to reason about the conversational state before selecting suggestion types, which produces more context-sensitive output than enumerating rules alone.

**Conversation state detection** is embedded in the prompt taxonomy:

| Detected state | Prioritised suggestion type |
|---------------|----------------------------|
| Question just asked | `answer` |
| Ambiguity or confusion | `clarification` |
| Bold claim made | `fact_check` |
| Decision forming | `talking_point` |
| Open discussion | `question` |

Output is requested as `response_format: json_object` for reliable parsing. Temperature is set to `0.3` — low enough for consistency, high enough to avoid repetition across batches.

### Clicked-answer prompt

A separate prompt with the full transcript context (up to 8,000 chars). The model is instructed to start with a direct answer, add substantive detail beyond the preview, and reference specific transcript moments where relevant. This runs at temperature `0.4` with a 1,000-token budget.

### Chat prompt

Stateful: includes the full transcript and a rolling window of the last 20 chat messages. Free-form chat uses Groq's SSE streaming API for real token-by-token delivery. Temperature is `0.6` for a conversational register.

### Context window rationale

| Window | Size | Reasoning |
|--------|------|-----------|
| Suggestions | 3,000 chars (~3–5 min of speech) | Recency is the signal — distant context dilutes "what's happening right now" |
| Chat | 8,000 chars (~10–15 min of speech) | Users asking questions may reference anything said earlier in the meeting |

Both values are configurable in Settings.

---

## Audio Architecture

WebM is a container format. The EBML file header is written only once, at the start of a `MediaRecorder` session. Splitting a stream by accumulating `ondataavailable` blobs and concatenating them produces files missing their header — Whisper rejects them.

The fix: the recorder is **stopped and restarted** every N seconds on the same underlying `MediaStream`. Each new recorder session writes a fresh EBML header, so every blob sent to the server is a fully self-contained, valid audio file.

```
MediaStream (mic) — stays open throughout
    └── MediaRecorder cycle 1 (0–5s)  → valid WebM blob → Whisper
    └── MediaRecorder cycle 2 (5–10s) → valid WebM blob → Whisper
    └── MediaRecorder cycle 3 (10–15s)→ valid WebM blob → Whisper
```

Audio is also requested with `channelCount: 1`, `sampleRate: 16000`, `echoCancellation: true`, and `noiseSuppression: true` — optimised for Whisper's expected input format.

---

## WebSocket Protocol

All communication between client and server uses a typed JSON message protocol over a single persistent WebSocket connection.

**Client → Server**

| Message type | Purpose |
|-------------|---------|
| `init` | Send API key and initial settings on connect |
| `audio_chunk` | Base64-encoded WebM audio blob |
| `refresh_suggestions` | Manual suggestion refresh trigger |
| `chat_message` | User chat message (free-form or suggestion click) |
| `update_settings` | Live prompt/context window updates from Settings modal |

**Server → Client**

| Message type | Purpose |
|-------------|---------|
| `transcript_chunk` | Transcribed text chunk with timestamp |
| `suggestion_batch` | Array of 3 suggestions |
| `chat_token` | Single streaming token with message ID |
| `chat_done` | Stream complete, full content |
| `status` | Server state: `transcribing`, `generating_suggestions`, `idle` |
| `error` | Error message for display |

The client auto-reconnects with a 2-second backoff on connection loss. Settings and the API key are re-sent on each reconnect via a fresh `init` message.

---

## Local Development

### Prerequisites

- Node.js 18+
- A [Groq API key](https://console.groq.com)

### Setup

```bash
# Clone the repository
git clone https://github.com/ask-elad/twinmind-ai.git
cd twinmind-ai

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..
```

### Run locally

```bash
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- WebSocket: ws://localhost:3001/ws
- Health check: http://localhost:3001/health

### First use

1. Open http://localhost:5173
2. Click **Customize** → paste your Groq API key → Save
3. Click the mic button to start recording
4. Speak — transcript appears every ~5 seconds
5. Suggestions refresh automatically every 30 seconds, or click **↺ Reload suggestions**
6. Click any suggestion card for a detailed answer in the Chat panel
7. Type directly in Chat for free-form questions
8. Click **↓** to export the full session as JSON

---

## Deployment

### Backend — Railway

```bash
cd server
npm run build
# Deploy via Railway GitHub integration
# Root directory: server
# Build command: npm install && npm run build
# Start command: node dist/index.js
# Environment variable: PORT = 3001
```

The `server/railway.json` configures the build and start commands automatically.

### Frontend — Vercel

```bash
cd client
# Deploy via Vercel GitHub integration
# Root directory: client
# Framework: Vite (auto-detected)
# Build command: npm run build
# Output directory: dist
# Environment variable: VITE_WS_URL = wss://your-railway-url.up.railway.app/ws
```

> After setting `VITE_WS_URL`, trigger a fresh redeploy — Vite bakes environment variables into the bundle at compile time.

---

## Key Tradeoffs

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transport | WebSocket | Bi-directional, persistent — enables real token streaming and server-push for transcript chunks |
| Audio chunking | Recorder rotation every 5s | Produces valid EBML-headered WebM files; concatenating blobs produces broken files Whisper rejects |
| Suggestion count | Always 3 | Matches prototype spec; three options is the cognitive sweet spot — enough variety, not overwhelming |
| JSON output | `response_format: json_object` | Reliable structured parsing vs. regex on freeform text |
| Chat history | Last 20 messages | Sufficient for coherent multi-turn conversation; stays within token limits |
| Click-answer delivery | Word-by-word with 8ms delay | Detailed answers use a single non-streaming call; simulated streaming keeps the UX consistent with real streaming chat |
| API key storage | `localStorage` only | No server-side storage required; the key is used as a credential per Groq request and never logged |
| Noise filtering | Server-side, pre-suggestion | Prevents filler words and Whisper hallucinations (silent audio → `"Thank you."`) from polluting the suggestion context |
| Suggestion dedup | `recentSuggestionPreviews` list | Passed to the model on every call; prevents the same suggestion from appearing across consecutive refresh cycles |

---

## Environment Variables

| Variable | Location | Description |
|----------|----------|-------------|
| `PORT` | Server (Railway) | HTTP/WS server port (default: 3001) |
| `VITE_WS_URL` | Client (Vercel) | WebSocket backend URL, e.g. `wss://your-app.up.railway.app/ws` |

The Groq API key is **not** an environment variable — it is entered by the user at runtime and stored in their browser's `localStorage`.

---

## Browser Compatibility

Audio capture uses `MediaRecorder` with `audio/webm;codecs=opus`. This is fully supported in Chrome and Edge. Firefox uses `audio/ogg;codecs=opus` as a fallback (also handled). Safari does not support WebM recording and is not supported.

---

## Notes

- No login, no server-side data persistence — all session state lives in memory per WebSocket connection and is lost on page reload
- The Groq API key is stored in the browser only and is never sent to or stored by the application server
- The app is designed for Chrome; mic capture behaviour in other browsers may vary
