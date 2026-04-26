import { useState } from "react";
import { X } from "lucide-react";
import { SessionSettings } from "../types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  groqApiKey: string;
  settings: SessionSettings;
  onSaveApiKey: (key: string) => void;
  onSaveSettings: (settings: SessionSettings) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  groqApiKey,
  settings,
  onSaveApiKey,
  onSaveSettings,
}: Props) {
  const [localKey, setLocalKey] = useState(groqApiKey);
  const [localSettings, setLocalSettings] = useState<SessionSettings>(settings);
  const [activeTab, setActiveTab] = useState<"api" | "prompts" | "context">("api");

  if (!isOpen) return null;

  function handleSave() {
    onSaveApiKey(localKey);
    onSaveSettings(localSettings);
    onClose();
  }

  function updateSetting<K extends keyof SessionSettings>(key: K, value: SessionSettings[K]) {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">⚙ Settings</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-tabs">
          {(["api", "prompts", "context"] as const).map((tab) => (
            <button
              key={tab}
              className={`modal-tab ${activeTab === tab ? "modal-tab--active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "api" ? "API Key" : tab === "prompts" ? "Prompts" : "Context Windows"}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {activeTab === "api" && (
            <div className="settings-section">
              <label className="settings-label">Groq API Key</label>
              <input
                type="password"
                className="settings-input"
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                placeholder="gsk_..."
                autoComplete="off"
              />
              <p className="settings-hint">
                Get your key at{" "}
                <a href="https://console.groq.com" target="_blank" rel="noreferrer">
                  console.groq.com
                </a>
                . Never stored on our servers.
              </p>
            </div>
          )}

          {activeTab === "prompts" && (
            <>
              <div className="settings-section">
                <label className="settings-label">Live Suggestions Prompt</label>
                <textarea
                  className="settings-textarea"
                  value={localSettings.suggestionPrompt}
                  onChange={(e) => updateSetting("suggestionPrompt", e.target.value)}
                  rows={8}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label">Clicked Answer Prompt</label>
                <textarea
                  className="settings-textarea"
                  value={localSettings.clickedAnswerPrompt}
                  onChange={(e) => updateSetting("clickedAnswerPrompt", e.target.value)}
                  rows={8}
                />
              </div>
              <div className="settings-section">
                <label className="settings-label">Chat Prompt</label>
                <textarea
                  className="settings-textarea"
                  value={localSettings.chatPrompt}
                  onChange={(e) => updateSetting("chatPrompt", e.target.value)}
                  rows={5}
                />
              </div>
            </>
          )}

          {activeTab === "context" && (
            <>
              <div className="settings-section">
                <label className="settings-label">
                  Suggestion Context Window (chars)
                  <span className="settings-value"> {localSettings.suggestionContextWindow.toLocaleString()}</span>
                </label>
                <input
                  type="range"
                  min={500}
                  max={8000}
                  step={500}
                  value={localSettings.suggestionContextWindow}
                  onChange={(e) => updateSetting("suggestionContextWindow", Number(e.target.value))}
                  className="settings-range"
                />
                <p className="settings-hint">
                  Characters of recent transcript used for generating suggestions. Smaller = more focused on recent context.
                </p>
              </div>
              <div className="settings-section">
                <label className="settings-label">
                  Chat Context Window (chars)
                  <span className="settings-value"> {localSettings.chatContextWindow.toLocaleString()}</span>
                </label>
                <input
                  type="range"
                  min={2000}
                  max={16000}
                  step={1000}
                  value={localSettings.chatContextWindow}
                  onChange={(e) => updateSetting("chatContextWindow", Number(e.target.value))}
                  className="settings-range"
                />
                <p className="settings-hint">
                  Characters of full transcript sent with chat and clicked-answer prompts. Larger = more context but higher latency.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn--secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleSave}>Save &amp; Apply</button>
        </div>
      </div>
    </div>
  );
}
