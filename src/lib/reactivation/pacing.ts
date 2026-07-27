export const REACTIVATION_MIN_DELAY_MS = 30_000;
export const REACTIVATION_MAX_DELAY_MS = 50_000;

export function randomReactivationDelayMs(random = Math.random) {
  const range = REACTIVATION_MAX_DELAY_MS - REACTIVATION_MIN_DELAY_MS + 1;
  return REACTIVATION_MIN_DELAY_MS + Math.floor(random() * range);
}

export function waitForReactivationDelay(random = Math.random) {
  const delayMs = randomReactivationDelayMs(random);
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
