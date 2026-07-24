import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendDueReactivationTouches } from '@/lib/reactivation/worker';

export const maxDuration = 60;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const { id } = await context.params;
    const body = await request.json();
    const action = String(body?.action ?? '');
    const db = supabaseAdmin();
    const { data: actor } = await db
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .single();
    if (!action) {
      const name = String(body?.name ?? '').trim();
      const objective = String(body?.objectiveSegment ?? 'all');
      const entryMin = optionalNumber(body?.entryValueMin);
      const entryMax = optionalNumber(body?.entryValueMax);
      if (name.length < 3 || name.length > 120)
        return NextResponse.json(
          { error: 'O nome deve ter entre 3 e 120 caracteres.' },
          { status: 400 }
        );
      if (!['all', 'live', 'invest', 'unknown'].includes(objective))
        return NextResponse.json(
          { error: 'O objetivo selecionado é inválido.' },
          { status: 400 }
        );
      if (entryMin != null && entryMin < 0)
        return NextResponse.json(
          { error: 'A entrada mínima não pode ser negativa.' },
          { status: 400 }
        );
      if (entryMax != null && (entryMax < 0 || entryMax < (entryMin ?? 0)))
        return NextResponse.json(
          { error: 'A entrada máxima deve ser maior ou igual à mínima.' },
          { status: 400 }
        );
      const { data, error } = await db
        .from('reactivation_campaigns')
        .update({
          name,
          objective_segment: objective,
          entry_value_min: entryMin,
          entry_value_max: entryMax,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('account_id', accountId)
        .eq('status', 'draft')
        .select()
        .maybeSingle();
      if (error) throw error;
      if (!data)
        return NextResponse.json(
          { error: 'Somente campanhas em rascunho podem ser editadas.' },
          { status: 409 }
        );
      await db.from('reactivation_events').insert({
        account_id: accountId,
        campaign_id: id,
        event_type: 'campaign_updated',
        actor_type: 'user',
        actor_profile_id: actor?.id ?? null,
      });
      return NextResponse.json({ campaign: data });
    }
    if (!['pause', 'resume', 'cancel'].includes(action))
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
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
    const sent =
      action === 'resume' ? await sendDueReactivationTouches(db) : undefined;
    return NextResponse.json({ campaign: data, sent });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId } = await requireRole('admin');
    const { id } = await context.params;
    const db = supabaseAdmin();
    const { data: campaign, error: readError } = await db
      .from('reactivation_campaigns')
      .select('id,status,activated_at')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle();
    if (readError) throw readError;
    if (!campaign)
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    if (campaign.status !== 'draft' || campaign.activated_at)
      return NextResponse.json(
        {
          error:
            'Campanhas já ativadas devem ser canceladas para preservar o histórico e a auditoria.',
        },
        { status: 409 }
      );
    const { error } = await db
      .from('reactivation_campaigns')
      .delete()
      .eq('id', id)
      .eq('account_id', accountId);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

function optionalNumber(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
