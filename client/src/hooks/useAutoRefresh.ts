import { useEffect, useRef } from "react";

interface UseAutoRefreshOptions {
  enabled: boolean;
  intervalMs: number;
  onRefresh: () => void;
}

export function useAutoRefresh({ enabled, intervalMs, onRefresh }: UseAutoRefreshOptions) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      onRefreshRef.current();
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled, intervalMs]);
}
