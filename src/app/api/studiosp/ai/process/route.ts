import { timingSafeEqual } from 'node:crypto';
import { after, NextResponse } from 'next/server';
import {
  processAiReplyQueue,
  waitForInboundQuietPeriod,
} from '@/lib/ai/reply-queue';

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const processed = await processAiReplyQueue(undefined, 25);
  return NextResponse.json({ processed });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const requestedDelay = Number(body?.delayMs ?? 0);
  const delayMs = Math.max(0, Math.min(requestedDelay, 240_000));
  after(async () => {
    if (delayMs) await waitForInboundQuietPeriod(delayMs);
    await processAiReplyQueue(undefined, 10);
  });

  return NextResponse.json({ accepted: true, delayMs }, { status: 202 });
}

function isAuthorized(request: Request) {
  const supplied =
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const acceptedSecrets = [
    process.env.AI_WORKER_SECRET,
    process.env.CRON_SECRET,
    process.env.AUTOMATION_CRON_SECRET,
  ].filter((value): value is string => Boolean(value));
  return acceptedSecrets.some((expected) => safeMatch(supplied, expected));
}

function safeMatch(received: string, expected: string) {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
