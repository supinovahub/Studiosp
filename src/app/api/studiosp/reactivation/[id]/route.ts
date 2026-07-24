import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body?.action ?? '');
    if (!['pause', 'resume', 'cancel'].includes(action))
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    const db = supabaseAdmin();
    const { data: actor } = await db
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .single();
    const status =
      action === 'pause'
        ? 'paused'
        : action === 'resume'
          ? 'active'
          : 'cancelled';
    const { data, error } = await db
      .from('reactivation_campaigns')
      .update({ status })
      .eq('id', id)
      .eq('account_id', accountId)
      .select()
      .single();
    if (error) throw error;
    if (action === 'cancel') {
      await db
        .from('reactivation_touches')
        .update({ status: 'cancelled' })
        .eq('campaign_id', id)
        .eq('status', 'scheduled');
    }
    await db.from('reactivation_events').insert({
      account_id: accountId,
      campaign_id: id,
      event_type: `campaign_${action}`,
      actor_type: 'user',
      actor_profile_id: actor?.id ?? null,
    });
    return NextResponse.json({ campaign: data });
  } catch (error) {
    return toErrorResponse(error);
  }
}
