import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { getInvitationBaseUrl } from '@/lib/auth/invitation-base-url';
import { generateInviteToken, inviteUrl } from '@/lib/auth/invitations';
import {
  checkRateLimit,
  RATE_LIMITS,
  rateLimitResponse,
} from '@/lib/rate-limit';

interface ActiveLinkRow {
  id: string;
  created_at: string;
  updated_at: string;
}

export async function GET() {
  try {
    const ctx = await requireRole('owner');
    const { data: link, error } = await ctx.supabase
      .from('broker_invite_links')
      .select('id, created_at, updated_at')
      .eq('account_id', ctx.accountId)
      .eq('is_active', true)
      .maybeSingle<ActiveLinkRow>();

    if (error) {
      console.error('[GET /api/account/broker-invite-link] link error:', error);
      return NextResponse.json(
        { error: 'Falha ao carregar o link global' },
        { status: 500 }
      );
    }

    if (!link) {
      return NextResponse.json({ link: null });
    }

    const { count, error: countError } = await ctx.supabase
      .from('broker_invite_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('link_id', link.id);

    if (countError) {
      console.error(
        '[GET /api/account/broker-invite-link] count error:',
        countError
      );
      return NextResponse.json(
        { error: 'Falha ao carregar os usos do link global' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      link: {
        id: link.id,
        createdAt: link.created_at,
        updatedAt: link.updated_at,
        redemptionCount: count ?? 0,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('owner');
    const limit = checkRateLimit(
      `owner:globalBrokerInviteRotate:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { token, hash } = generateInviteToken();
    const { data, error } = await ctx.supabase.rpc(
      'studiosp_rotate_global_broker_invite',
      { p_token_hash: hash }
    );

    if (error || !data || typeof data !== 'object') {
      console.error(
        '[POST /api/account/broker-invite-link] rotation error:',
        error
      );
      return NextResponse.json(
        { error: 'Falha ao gerar o link global' },
        { status: 500 }
      );
    }

    const result = data as { id?: unknown; created_at?: unknown };
    if (typeof result.id !== 'string') {
      return NextResponse.json(
        { error: 'O banco retornou um link inválido' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        link: {
          id: result.id,
          createdAt:
            typeof result.created_at === 'string'
              ? result.created_at
              : new Date().toISOString(),
          updatedAt:
            typeof result.created_at === 'string'
              ? result.created_at
              : new Date().toISOString(),
          redemptionCount: 0,
        },
        url: inviteUrl(token, getInvitationBaseUrl(request)),
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const ctx = await requireRole('owner');
    const limit = checkRateLimit(
      `owner:globalBrokerInviteDisable:${ctx.userId}`,
      RATE_LIMITS.adminAction
    );
    if (!limit.success) return rateLimitResponse(limit);

    const { data, error } = await ctx.supabase.rpc(
      'studiosp_disable_global_broker_invite'
    );

    if (error) {
      console.error(
        '[DELETE /api/account/broker-invite-link] disable error:',
        error
      );
      return NextResponse.json(
        { error: 'Falha ao desativar o link global' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, disabled: data === true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
