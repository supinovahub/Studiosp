const DEFAULT_DELAY_MS = 8_250;

export async function triggerAiReplyProcessor(delayMs = DEFAULT_DELAY_MS) {
  const secret =
    process.env.AI_WORKER_SECRET ??
    process.env.CRON_SECRET ??
    process.env.AUTOMATION_CRON_SECRET;
  const deploymentHost = process.env.VERCEL_URL;
  if (!secret || !deploymentHost) {
    console.warn(
      '[Studiosp/IA] worker não acionado imediatamente; o cron fará a recuperação.'
    );
    return false;
  }

  const response = await fetch(
    `https://${deploymentHost}/api/studiosp/ai/process`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ delayMs }),
      cache: 'no-store',
    }
  );
  if (!response.ok) {
    console.error(
      `[Studiosp/IA] worker recusou o acionamento (${response.status}).`
    );
    return false;
  }
  return true;
}
