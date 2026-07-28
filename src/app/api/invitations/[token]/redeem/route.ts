// ============================================================
// POST /api/invitations/[token]/redeem
//
// Authenticated. Caller atomically moves from their personal
// account (created at signup) to the inviter's account with the
// invite's role. Heavy lifting lives in the SECURITY DEFINER
// `redeem_invitation` RPC from migration 019.
//
// Refusal contract (from the RPC)
//   - SQLSTATE 42501 → 401 (caller not authenticated)
//   - SQLSTATE 22023 → 400 (invitation not_found / used / expired)
//   - SQLSTATE 23505 → 409 (caller's account already has data /
//     they're already in this or another shared account)
//
// Rate limit (per IP) is the same shape as peek but tighter —
// a successful redeem changes data, and the RPC's data-loss
// guard makes brute-force retries pointless past a few attempts.
// ============================================================

import { NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';

import { hashInviteToken } from '@/lib/auth/invitations';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { normalizeBrokerWhatsApp } from '@/lib/studiosp/broker-phone';
import { createClient } from '@/lib/supabase/server';

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const xri = request.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

function rpcErrorToResponse(err: PostgrestError): NextResponse {
  if (err.code === '42501') {
    return NextResponse.json(
      { error: 'Falha ao processar a solicitação' },
      { status: 401 }
    );
  }
  if (err.code === '22023') {
    return NextResponse.json(
      { error: 'Falha ao processar a solicitação' },
      { status: 400 }
    );
  }
  if (err.code === '23514') {
    return NextResponse.json(
      { error: 'Informe um WhatsApp válido com DDI.' },
      { status: 400 }
    );
  }
  if (err.code === 'P0001') {
    return NextResponse.json(
      { error: 'Este WhatsApp já pertence a outro corretor.' },
      { status: 409 }
    );
  }
  if (err.code === '23505') {
    return NextResponse.json(
      { error: 'Falha ao processar a solicitação' },
      { status: 409 }
    );
  }
  console.error('[redeem] unexpected RPC error:', err);
  return NextResponse.json(
    { error: 'Falha ao resgatar convite' },
    { status: 500 }
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`redeem:${ip}`, RATE_LIMITS.invitationRedeem);
  if (!limit.success) return rateLimitResponse(limit);

  const { token } = await params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json(
      { error: 'Token de convite ausente' },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const body = (await request.json().catch(() => ({}))) as {
    whatsappE164?: unknown;
  };
  const whatsappE164 = normalizeBrokerWhatsApp(body.whatsappE164) || null;

  // The RPC checks `auth.uid()` itself, but failing fast here
  // gives a cleaner 401 without a Supabase round trip on the
  // common "user clicked the link before logging in" path.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const tokenHash = hashInviteToken(token);
  const { data: globalPeek, error: globalPeekError } = await supabase.rpc(
    'peek_global_broker_invite',
    { p_token_hash: tokenHash }
  );

  if (globalPeekError) {
    console.error('[redeem] global invite lookup error:', globalPeekError);
    return NextResponse.json(
      { error: 'Falha ao verificar o convite' },
      { status: 500 }
    );
  }

  const isGlobalBrokerInvite =
    !!globalPeek &&
    typeof globalPeek === 'object' &&
    'ok' in globalPeek &&
    globalPeek.ok === true;

  const { data: accountId, error } = isGlobalBrokerInvite
    ? await supabase.rpc('redeem_global_broker_invite_with_whatsapp', {
        p_token_hash: tokenHash,
        p_whatsapp_e164: whatsappE164,
      })
    : await supabase.rpc('redeem_invitation_with_broker_whatsapp', {
        p_token_hash: tokenHash,
        p_whatsapp_e164: whatsappE164,
      });

  if (error) return rpcErrorToResponse(error);

  return NextResponse.json({ ok: true, accountId });
}
