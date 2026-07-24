import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account';

function safeText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();
    const body = (await request.json()) as Record<string, unknown>;
    console.error(
      JSON.stringify({
        event: 'frontend_exception',
        accountId: ctx.accountId,
        userId: ctx.userId,
        route: safeText(body.route, 300),
        message: safeText(body.message, 1_000),
        digest: safeText(body.digest, 200),
        userAgent: safeText(request.headers.get('user-agent'), 500),
        occurredAt: new Date().toISOString(),
      })
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return toErrorResponse(error);
  }
}

