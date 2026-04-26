import { randomUUID } from "crypto";

export function randomId(): string {
  return randomUUID();
}

export function buildFullTranscript(
  chunks: Array<{ text: string; timestamp: number }>
): string {
  return chunks.map((c) => c.text).join(" ");
}

export function log(level: "info" | "warn" | "error", msg: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level.toUpperCase()}]`;
  if (data !== undefined) {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](prefix, msg, data);
  } else {
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](prefix, msg);
  }
}
