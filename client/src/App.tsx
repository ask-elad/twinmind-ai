import { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import {
  TranscriptChunk,
  SuggestionBatch,
  ChatMessage,
  Suggestion,
  ServerMessage,
  SessionSettings,
} from "./types";
import { DEFAULT_SETTINGS } from "./lib/constants";
import { buildExportData, downloadExport } from "./lib/export";
import { useWebSocket } from "./hooks/useWebSocket";
import { useAudioRecorder } from "./hooks/useAudioRecorder";
import { useAutoRefresh } from "./hooks/useAutoRefresh";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { SuggestionsPanel } from "./components/SuggestionsPanel";
import { ChatPanel } from "./components/ChatPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ConnectionIndicator } from "./components/ConnectionIndicator";

const AUTO_REFRESH_INTERVAL = 30000; // 30s
const TRANSCRIPT_CHUNK_MS = 5000; // FIX 3: 5s chunks for near-real-time transcript

export default function App() {
  // Core state
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [suggestionBatches, setSuggestionBatches] = useState<SuggestionBatch[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // UI state
  const [serverStatus, setServerStatus] = useState<"idle" | "transcribing" | "generating_suggestions">("idle");
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [nextRefreshIn, setNextRefreshIn] = useState(30);

  // Persisted settings
  const [groqApiKey, setGroqApiKey] = useState<string>(() => {
    return localStorage.getItem("twinmind_groq_key") ?? "";
  });
  const [settings, setSettings] = useState<SessionSettings>(() => {
    try {
      const saved = localStorage.getItem("twinmind_settings");
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Streaming message accumulator
  const streamingMsgRef = useRef<Map<string, string>>(new Map());
  const refreshPendingRef = useRef(false);
  const refreshFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show error briefly
  function showError(msg: string) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  }

    function clearPendingRefresh() {
    refreshPendingRef.current = false;
    if (refreshFallbackTimerRef.current) {
      clearTimeout(refreshFallbackTimerRef.current);
      refreshFallbackTimerRef.current = null;
    }
  }

  const handleServerMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "transcript_chunk":
        setTranscript((prev) => [...prev, msg.chunk]);

        if (refreshPendingRef.current) {
          clearPendingRefresh();
          requestSuggestionRefresh();
        }
        break;

      case "suggestion_batch":
        setSuggestionBatches((prev) => [msg.batch, ...prev]);
        setIsGeneratingSuggestions(false);
        clearPendingRefresh();
        setNextRefreshIn(30);
        break;

      case "chat_token": {
        const { messageId, token } = msg;
        const current = streamingMsgRef.current.get(messageId) ?? "";
        const updated = current + token;
        streamingMsgRef.current.set(messageId, updated);

        setChatMessages((prev) => {
          const existing = prev.find((m) => m.id === messageId);
          if (existing) {
            return prev.map((m) =>
              m.id === messageId ? { ...m, content: updated, streaming: true } : m
            );
          } else {
            return [
              ...prev,
              {
                id: messageId,
                role: "assistant",
                content: updated,
                timestamp: Date.now(),
                streaming: true,
              },
            ];
          }
        });
        break;
      }

      case "chat_done": {
        const { messageId, fullContent } = msg;
        streamingMsgRef.current.delete(messageId);
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content: fullContent, streaming: false } : m
          )
        );
        setIsStreaming(false);
        break;
      }

      case "error":
        showError(msg.message);
        clearPendingRefresh();
        setIsGeneratingSuggestions(false);
        setIsStreaming(false);
        break;

      case "status":
        setServerStatus(msg.status);
        if (msg.status === "generating_suggestions") setIsGeneratingSuggestions(true);
        if (msg.status === "idle") setIsGeneratingSuggestions(false);
        break;
    }
  }, []);

  const { sendMessage, connectionStatus } = useWebSocket({
    onMessage: handleServerMessage,
    groqApiKey,
    settings,
  });

  const requestSuggestionRefresh = useCallback(() => {
    if (!groqApiKey) {
      setSettingsOpen(true);
      return false;
    }
    if (isGeneratingSuggestions) return false;

    const sent = sendMessage({ type: "refresh_suggestions" });
    if (!sent) {
      showError("Server connection not ready yet.");
      return false;
    }

    setIsGeneratingSuggestions(true);
    return true;
  }, [groqApiKey, isGeneratingSuggestions, sendMessage]);


  const handleAudioChunk = useCallback(
    (base64: string) => {
      sendMessage({ type: "audio_chunk", data: base64 });
    },
    [sendMessage]
  );

  const { isRecording, start, stop, flushNow } = useAudioRecorder({
    onChunk: handleAudioChunk,
    transcriptChunkMs: TRANSCRIPT_CHUNK_MS,
  });

  async function toggleMic() {
    if (!groqApiKey) {
      setSettingsOpen(true);
      showError("Add your Groq API key first.");
      return;
    }
    if (isRecording) {
      stop();
    } else {
      try {
        await start();
      } catch {
        showError("Microphone access denied. Please allow mic access and try again.");
      }
    }
  }

  function handleRefresh() {
    if (!groqApiKey) {
      setSettingsOpen(true);
      return;
    }

    if (isGeneratingSuggestions || refreshPendingRef.current) return;

    clearPendingRefresh();

    if (isRecording) {
      refreshPendingRef.current = true;
      flushNow();

      refreshFallbackTimerRef.current = setTimeout(() => {
        refreshPendingRef.current = false;
        refreshFallbackTimerRef.current = null;
        requestSuggestionRefresh();
      }, 1500);

      return;
    }

    requestSuggestionRefresh();
  }

  useEffect(() => {
    return () => {
      if (refreshFallbackTimerRef.current) {
        clearTimeout(refreshFallbackTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const interval = setInterval(() => {
      setNextRefreshIn((prev) => {
        if (prev <= 1) return 30;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isRecording]);

  useAutoRefresh({
    enabled: isRecording && !!groqApiKey,
    intervalMs: AUTO_REFRESH_INTERVAL,
    onRefresh: handleRefresh,
  });

  function handleSuggestionClick(suggestion: Suggestion) {
    if (!groqApiKey) {
      setSettingsOpen(true);
      return;
    }
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: suggestion.preview,
      timestamp: Date.now(),
      suggestionId: suggestion.id,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    sendMessage({
      type: "chat_message",
      content: suggestion.preview,
      suggestionId: suggestion.id,
      suggestionPreview: suggestion.preview,
    });
  }

  function handleChatMessage(content: string) {
    if (!groqApiKey) {
      setSettingsOpen(true);
      return;
    }
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    sendMessage({ type: "chat_message", content });
  }

  function handleSaveApiKey(key: string) {
    setGroqApiKey(key);
    localStorage.setItem("twinmind_groq_key", key);
  }

  function handleSaveSettings(newSettings: SessionSettings) {
    setSettings(newSettings);
    localStorage.setItem("twinmind_settings", JSON.stringify(newSettings));
    sendMessage({ type: "update_settings", settings: newSettings });
  }

  function handleExport() {
    const data = buildExportData(transcript, suggestionBatches, chatMessages);
    downloadExport(data);
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-tm">TwinMind</span>
            <span className="logo-sep"> — </span>
            <span className="logo-sub">Live Suggestions Web App</span>
          </div>
          <ConnectionIndicator status={connectionStatus} />
        </div>
        <div className="header-right">
          <span className="layout-hint">
            3-column layout · Transcript · Live Suggestions · Chat
          </span>
          <button
            className="btn btn--ghost"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings size={14} />
            Customize
          </button>
        </div>
      </header>

      {/* Error toast */}
      {errorMsg && (
        <div className="error-toast" onClick={() => setErrorMsg(null)}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* API key banner */}
      {!groqApiKey && (
        <div className="api-key-banner">
          <span>No Groq API key set.</span>
          <button className="btn btn--primary btn--sm" onClick={() => setSettingsOpen(true)}>
            Add API Key
          </button>
        </div>
      )}

      {/* Main 3-column layout */}
      <main className="columns">
        <TranscriptPanel
          chunks={transcript}
          isRecording={isRecording}
          status={serverStatus}
          onToggleMic={toggleMic}
          onExport={handleExport}
        />
        <SuggestionsPanel
          batches={suggestionBatches}
          isLoading={isGeneratingSuggestions}
          onRefresh={handleRefresh}
          onSuggestionClick={handleSuggestionClick}
          nextRefreshIn={nextRefreshIn}
        />
        <ChatPanel
          messages={chatMessages}
          onSendMessage={handleChatMessage}
          isStreaming={isStreaming}
        />
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        groqApiKey={groqApiKey}
        settings={settings}
        onSaveApiKey={handleSaveApiKey}
        onSaveSettings={handleSaveSettings}
      />
    </div>
  );
}
