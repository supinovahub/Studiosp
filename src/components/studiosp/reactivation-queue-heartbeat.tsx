'use client';

import { useEffect } from 'react';

const INTERVAL_MS = 60_000;

/**
 * The Hobby deployment can schedule Vercel Cron only once per day. While an
 * owner/admin is operating the CRM, this heartbeat advances one due
 * reactivation touch per minute. The database claim remains idempotent and
 * account-scoped; the daily cron is the fallback when nobody has the CRM open.
 */
export function ReactivationQueueHeartbeat({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    let running = false;
    const processNext = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        await fetch('/api/studiosp/reactivation/process', {
          method: 'POST',
          keepalive: true,
        });
      } catch {
        // Best-effort heartbeat. The daily cron remains the fallback and the
        // next visible interval retries without changing queue state.
      } finally {
        running = false;
      }
    };

    const timer = window.setInterval(() => void processNext(), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  return null;
}
