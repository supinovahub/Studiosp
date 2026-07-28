type FollowupWindow = {
  timezone?: unknown;
  allowed_weekdays?: unknown;
  window_start?: unknown;
  window_end?: unknown;
};

const WEEKDAYS: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function isInsideFollowupWindow(date: Date, policy: FollowupWindow) {
  const timezone = String(policy.timezone ?? 'America/Sao_Paulo');
  const allowed = Array.isArray(policy.allowed_weekdays)
    ? policy.allowed_weekdays.map(Number)
    : [1, 2, 3, 4, 5, 6];
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );
  const weekday = WEEKDAYS[value.weekday];
  const time = `${value.hour}:${value.minute}`;
  const start = String(policy.window_start ?? '09:00').slice(0, 5);
  const end = String(policy.window_end ?? '20:00').slice(0, 5);
  return allowed.includes(weekday) && time >= start && time < end;
}

export function nextAllowedFollowupAt(requested: Date, policy: FollowupWindow) {
  const candidate = new Date(requested);
  candidate.setUTCSeconds(0, 0);
  const remainder = candidate.getUTCMinutes() % 15;
  if (remainder)
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 15 - remainder);
  for (let index = 0; index < 8 * 24 * 4; index++) {
    if (isInsideFollowupWindow(candidate, policy)) return candidate;
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 15);
  }
  return requested;
}
