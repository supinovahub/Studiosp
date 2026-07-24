import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendDueReactivationTouches } from '@/lib/reactivation/worker';
import { normalizePhone } from '@/lib/whatsapp/phone-utils';

type Row = Record<string, unknown>;

export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { accountId, userId } = await requireRole('admin');
    const { id } = await context.params;
    const db = supabaseAdmin();
    const { data: actor } = await db
      .from('profiles')
      .select('id')
      .eq('account_id', accountId)
      .eq('user_id', userId)
      .single();
    const [{ data: campaign }, { data: leads }, { data: whatsapp }] =
      await Promise.all([
        db
          .from('reactivation_campaigns')
          .select('*')
          .eq('id', id)
          .eq('account_id', accountId)
          .maybeSingle(),
        db
          .from('reactivation_leads')
          .select('*')
          .eq('campaign_id', id)
          .in('status', ['pending_review', 'ready']),
        db
          .from('whatsapp_config')
          .select('user_id,status')
          .eq('account_id', accountId)
          .maybeSingle(),
      ]);
    if (!campaign)
      return NextResponse.json(
        { error: 'Campanha não encontrada.' },
        { status: 404 }
      );
    if (!whatsapp?.user_id || whatsapp.status !== 'connected')
      return NextResponse.json(
        { error: 'Conecte o WhatsApp antes de ativar a campanha.' },
        { status: 409 }
      );
    if (!leads?.length)
      return NextResponse.json(
        { error: 'A campanha não possui leads prontos.' },
        { status: 409 }
      );

    let queued = 0;
    const failures: string[] = [];
    for (const lead of leads as Row[]) {
      try {
        const contact = await findOrCreateContact(db, {
          accountId,
          ownerUserId: whatsapp.user_id,
          lead,
          campaignId: id,
        });
        const conversation = await findOrCreateConversation(
          db,
          accountId,
          whatsapp.user_id,
          String(contact.id)
        );
        const { data: opportunity, error: opportunityError } = await db.rpc(
          'studiosp_create_opportunity',
          {
            p_contact_id: contact.id,
            p_conversation_id: conversation.id,
            p_source_type: 'reactivation',
            p_source_metadata: {
              campaign_id: id,
              reactivation_lead_id: lead.id,
              known_name: lead.name,
              known_objective: lead.objective,
              known_entry_value: lead.entry_value,
            },
            p_idempotency_key: `reactivation:${id}:${lead.id}`,
          }
        );
        if (opportunityError) throw opportunityError;
        const opportunityId = String((opportunity as Row).id);
        const now = Date.now();
        const { error: touchesError } = await db
          .from('reactivation_touches')
          .upsert(
            [0, 2, 5, 9].map((days, index) => ({
              account_id: accountId,
              campaign_id: id,
              reactivation_lead_id: lead.id,
              step_number: index + 1,
              scheduled_for: new Date(now + days * 86_400_000).toISOString(),
            })),
            {
              onConflict: 'reactivation_lead_id,step_number',
              ignoreDuplicates: true,
            }
          );
        if (touchesError) throw touchesError;

        const wasSuppressed = contact.automation_status === 'suppressed';
        if (wasSuppressed) {
          const { error: enableError } = await db
            .from('contacts')
            .update({
              automation_status: 'enabled',
              automation_block_reason: null,
              automation_blocked_at: null,
              automation_blocked_by_import_id: null,
            })
            .eq('id', contact.id)
            .eq('account_id', accountId);
          if (enableError) throw enableError;
        }

        const { error: leadUpdateError } = await db
          .from('reactivation_leads')
          .update({
            status: 'queued',
            contact_id: contact.id,
            conversation_id: conversation.id,
            opportunity_id: opportunityId,
          })
          .eq('id', lead.id);
        if (leadUpdateError) {
          if (wasSuppressed) {
            await db
              .from('contacts')
              .update({
                automation_status: contact.automation_status,
                automation_block_reason: contact.automation_block_reason,
                automation_blocked_at: contact.automation_blocked_at,
                automation_blocked_by_import_id:
                  contact.automation_blocked_by_import_id,
              })
              .eq('id', contact.id)
              .eq('account_id', accountId);
          }
          throw leadUpdateError;
        }
        queued++;
      } catch (error) {
        failures.push(
          `${String(lead.row_number)}: ${
            error instanceof Error ? error.message : 'falha desconhecida'
          }`
        );
      }
    }
    if (!queued)
      return NextResponse.json(
        { error: 'Nenhum lead pôde ser preparado.', failures },
        { status: 409 }
      );
    await Promise.all([
      db
        .from('reactivation_campaigns')
        .update({ status: 'active', activated_at: new Date().toISOString() })
        .eq('id', id),
      db.from('reactivation_events').insert({
        account_id: accountId,
        campaign_id: id,
        event_type: 'campaign_activated',
        actor_type: 'user',
        actor_profile_id: actor?.id ?? null,
        payload: { queued, failed: failures.length },
      }),
    ]);
    const sent = await sendDueReactivationTouches(db);
    const { data: deliveryFailures } = await db
      .from('reactivation_touches')
      .select('step_number,last_error')
      .eq('campaign_id', id)
      .not('last_error', 'is', null);
    return NextResponse.json({
      queued,
      sent,
      failures,
      deliveryFailures: deliveryFailures ?? [],
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

async function findOrCreateContact(
  db: ReturnType<typeof supabaseAdmin>,
  args: {
    accountId: string;
    ownerUserId: string;
    campaignId: string;
    lead: Row;
  }
) {
  const phoneNormalized = normalizePhone(String(args.lead.phone_e164 ?? ''));
  const { data: existing, error: lookupError } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing) return existing;
  const { data, error } = await db
    .from('contacts')
    .insert({
      account_id: args.accountId,
      user_id: args.ownerUserId,
      phone: args.lead.phone_e164,
      name: args.lead.name ?? args.lead.phone_e164,
      email: args.lead.email,
      source_type: 'reactivation',
      source_metadata: {
        campaign_id: args.campaignId,
        reactivation_lead_id: args.lead.id,
      },
      originated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) {
    // Another request may have created the same normalized phone between the
    // lookup and insert. Resolve the winner instead of failing activation.
    if (error.code === '23505') {
      const { data: raced, error: racedError } = await db
        .from('contacts')
        .select('*')
        .eq('account_id', args.accountId)
        .eq('phone_normalized', phoneNormalized)
        .maybeSingle();
      if (racedError) throw racedError;
      if (raced) return raced;
    }
    throw error;
  }
  return data;
}

async function findOrCreateConversation(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  ownerUserId: string,
  contactId: string
) {
  const { data: existing } = await db
    .from('conversations')
    .select('*')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .limit(1)
    .maybeSingle();
  if (existing) return existing;
  const { data, error } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: ownerUserId,
      contact_id: contactId,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
