import { useCallback, useEffect, useRef, useState } from "react";
import { ClientMessage, ServerMessage, SessionSettings } from "../types";
import { WS_URL } from "../lib/constants";

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

interface UseWebSocketOptions {
  onMessage: (msg: ServerMessage) => void;
  groqApiKey: string;
  settings: SessionSettings;
}

export function useWebSocket({ onMessage, groqApiKey, settings }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const settingsRef = useRef(settings);
  const groqApiKeyRef = useRef(groqApiKey);
  const onMessageRef = useRef(onMessage);

  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { groqApiKeyRef.current = groqApiKey; }, [groqApiKey]);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setStatus("connected");

      const initMsg: ClientMessage = {
        type: "init",
        groqApiKey: groqApiKeyRef.current,
        settings: settingsRef.current,
      };
      ws.send(JSON.stringify(initMsg));
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        onMessageRef.current(msg);
      } catch {
        console.error("Failed to parse WS message");
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setStatus("reconnecting");
      reconnectTimer.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  // Re-init when API key changes (send update to existing connection)
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && groqApiKey) {
      wsRef.current.send(
        JSON.stringify({
          type: "init",
          groqApiKey,
          settings: settingsRef.current,
        } satisfies ClientMessage)
      );
    }
  }, [groqApiKey]);

  return { sendMessage, connectionStatus: status };
}
