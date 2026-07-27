type TouchLog = {
  status: string;
  attempt_count: number;
  last_error: string | null;
};

export function summarizeReactivationTouches(touches: TouchLog[]) {
  const summary = {
    total: touches.length,
    sent: 0,
    scheduled: 0,
    processing: 0,
    failed: 0,
    errors: 0,
    cancelled: 0,
    retried: 0,
  };

  for (const touch of touches) {
    if (touch.status in summary && touch.status !== 'total') {
      const status = touch.status as
        'sent' | 'scheduled' | 'processing' | 'failed' | 'cancelled';
      summary[status] += 1;
    }
    if (touch.last_error) summary.errors += 1;
    if (touch.attempt_count > 1) summary.retried += 1;
  }

  return summary;
}
