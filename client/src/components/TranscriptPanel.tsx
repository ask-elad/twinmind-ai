import { useEffect, useMemo, useRef } from "react";
import { Mic, MicOff, Download } from "lucide-react";
import { TranscriptChunk } from "../types";
import { formatTimestamp } from "../lib/export";

interface Props {
  chunks: TranscriptChunk[];
  isRecording: boolean;
  status: string;
  onToggleMic: () => void;
  onExport: () => void;
}

interface TranscriptSegment {
  id: string;
  startTimestamp: number;
  text: string;
}

const TRANSCRIPT_BLOCK_MS = 30_000;

export function TranscriptPanel({
  chunks,
  isRecording,
  status,
  onToggleMic,
  onExport,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const transcriptSegments = useMemo(() => {
    if (chunks.length === 0) return [];

    const orderedChunks = [...chunks].sort((a, b) => a.timestamp - b.timestamp);
    const baseTimestamp = orderedChunks[0].timestamp;

    const grouped: TranscriptSegment[] = [];

    for (const chunk of orderedChunks) {
      const text = chunk.text.replace(/\s+/g, " ").trim();
      if (!text) continue;

      const segmentIndex = Math.max(
        0,
        Math.floor((chunk.timestamp - baseTimestamp) / TRANSCRIPT_BLOCK_MS)
      );

      const existing = grouped[segmentIndex];
      if (existing) {
        existing.text = `${existing.text} ${text}`.trim();
      } else {
        grouped[segmentIndex] = {
          id: `transcript-segment-${segmentIndex}`,
          startTimestamp: baseTimestamp + segmentIndex * TRANSCRIPT_BLOCK_MS,
          text,
        };
      }
    }

    return grouped.filter((segment): segment is TranscriptSegment => Boolean(segment));
  }, [chunks]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptSegments]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-number">1.</span> MIC &amp; TRANSCRIPT
        </div>
        <div className="panel-status-row">
          <span className={`status-badge ${isRecording ? "status-recording" : "status-idle"}`}>
            {isRecording ? "RECORDING" : "IDLE"}
          </span>
          <button className="icon-btn" onClick={onExport} title="Export session">
            <Download size={14} />
          </button>
        </div>
      </div>

      <div className="mic-control">
        <button
          className={`mic-btn ${isRecording ? "mic-btn--active" : ""}`}
          onClick={onToggleMic}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
        </button>
        <span className="mic-hint">
          {isRecording
            ? "Recording — transcript is grouped into 30s blocks"
            : "Click mic to start. Transcript is grouped into 30s blocks."}
        </span>
      </div>

      {status === "transcribing" && (
        <div className="status-bar status-bar--transcribing">
          <span className="spinner" /> Transcribing audio…
        </div>
      )}

      <div className="transcript-body">
        {transcriptSegments.length === 0 ? (
          <p className="empty-hint">No transcript yet — start the mic.</p>
        ) : (
          transcriptSegments.map((segment) => (
            <div key={segment.id} className="transcript-chunk">
              <span className="chunk-time">{formatTimestamp(segment.startTimestamp)}</span>
              <p className="chunk-text">{segment.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}