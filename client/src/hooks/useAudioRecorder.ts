import { useCallback, useRef, useState } from "react";

interface UseAudioRecorderOptions {
  onChunk: (base64: string) => void;
  transcriptChunkMs?: number; // how often to produce a self-contained audio chunk
}

/**
 * WHY WE RESTART THE RECORDER EVERY N SECONDS
 * --------------------------------------------
 * WebM is a container format. The EBML file header is only written once,
 * at the very beginning of a MediaRecorder session. If you split the stream
 * by accumulating 1-second ondataavailable blobs and concatenating them into
 * a "5-second blob", every blob after the first is missing its header.
 * Whisper (and virtually every audio parser) will reject those as invalid.
 *
 * Solution: stop and re-start the MediaRecorder every N seconds on the SAME
 * underlying MediaStream. Each new recorder session writes a fresh EBML header,
 * so every blob we send is a fully self-contained, valid audio file.
 */
export function useAudioRecorder({
  onChunk,
  transcriptChunkMs = 5000,
}: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const rotateTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoppingRef = useRef(false); // prevents rotate firing after stop()
  const mimeTypeRef = useRef<string>("audio/webm");

  // Determine supported mime type once
  function getSupportedMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  }

  /**
   * Start a fresh MediaRecorder on the existing stream and collect all its
   * ondataavailable events into one blob, then send it when the recorder stops.
   */
  function startNewRecorderCycle(stream: MediaStream): MediaRecorder {
    const mimeType = mimeTypeRef.current;
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (chunks.length === 0) return;

      const blob = new Blob(chunks, { type: mimeType || "audio/webm" });

      // Only send if blob is large enough to contain real speech
      // (avoids sending near-empty chunks at the very start)
      if (blob.size < 1000) return;

      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        if (base64) onChunk(base64);
      };
      reader.readAsDataURL(blob);
    };

    // Timeslice=250ms: fire ondataavailable frequently so onstop gets all data quickly
    recorder.start(250);
    return recorder;
  }

  /**
   * Stop the current recorder cycle (triggers onstop → blob → onChunk),
   * then immediately start a new one — unless we're fully stopping.
   */
  const rotateRecorder = useCallback(() => {
    if (!streamRef.current || isStoppingRef.current) return;

    const old = activeRecorderRef.current;
    if (old && old.state !== "inactive") {
      old.stop(); // triggers onstop, which sends the blob
    }

    if (!isStoppingRef.current) {
      activeRecorderRef.current = startNewRecorderCycle(streamRef.current);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    if (isRecording) return;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    streamRef.current = stream;
    isStoppingRef.current = false;
    mimeTypeRef.current = getSupportedMimeType();

    // Start the first recorder cycle
    activeRecorderRef.current = startNewRecorderCycle(stream);
    setIsRecording(true);

    // Rotate every transcriptChunkMs — each rotation produces one valid audio file
    rotateTimerRef.current = setInterval(rotateRecorder, transcriptChunkMs);
  }, [isRecording, rotateRecorder, transcriptChunkMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    isStoppingRef.current = true;

    if (rotateTimerRef.current) {
      clearInterval(rotateTimerRef.current);
      rotateTimerRef.current = null;
    }

    // Stop current recorder — onstop will fire and send final chunk
    const rec = activeRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    activeRecorderRef.current = null;

    // Stop the mic tracks after a short delay to let onstop fire
    setTimeout(() => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }, 300);

    setIsRecording(false);
  }, []);

  // Manually trigger a rotation so the very latest audio is sent before suggestions refresh
  const flushNow = useCallback(() => {
    rotateRecorder();
  }, [rotateRecorder]);

  return { isRecording, start, stop, flushNow };
}
