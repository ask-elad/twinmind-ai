interface Props {
  status: "disconnected" | "connecting" | "connected" | "reconnecting";
}

const STATUS_CONFIG = {
  connected: { dot: "dot--green", label: "" },
  connecting: { dot: "dot--yellow", label: "Connecting…" },
  reconnecting: { dot: "dot--yellow pulse", label: "Reconnecting…" },
  disconnected: { dot: "dot--red", label: "Disconnected" },
};

export function ConnectionIndicator({ status }: Props) {
  const cfg = STATUS_CONFIG[status];
  if (status === "connected") return null; // don't show when all is fine

  return (
    <div className="connection-indicator">
      <span className={`dot ${cfg.dot}`} />
      <span className="connection-label">{cfg.label}</span>
    </div>
  );
}
