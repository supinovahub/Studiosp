import type { SupabaseClient } from '@supabase/supabase-js';
import { sendProviderText, type ProviderConfig } from '@/lib/whatsapp/provider';
import { sanitizePhoneForMeta } from '@/lib/whatsapp/phone-utils';
import { upsertOwnerAttention } from './attention';

// As ofertas são projeções dinâmicas das consultas administrativas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export async function handleBrokerOperationalReply(args: {
  db: SupabaseClient;
  accountId: string;
  whatsappConfigId: string;
  remoteChatId: string;
  phone: string;
  text: string | null;
  providerConfig: ProviderConfig;
}): Promise<boolean> {
  const normalized = sanitizePhoneForMeta(args.phone);
  const { data: broker } = await args.db
    .from('broker_profiles')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('whatsapp_e164', `+${normalized}`)
    .eq('is_active', true)
    .maybeSingle();
  if (!broker) return false;

  const { data: offer } = await args.db
    .from('assignment_offers')
    .select('*')
    .eq('account_id', args.accountId)
    .eq('broker_profile_id', broker.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('offered_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  // O mesmo número pode existir como corretor e como lead de teste. Sem uma
  // oferta válida não há contexto operacional suficiente para consumir a
  // mensagem: devolva o controle ao webhook para que Inbox e IA a processem.
  if (!offer) return false;

  await args.db.from('broker_operational_conversations').upsert(
    {
      account_id: args.accountId,
      broker_profile_id: broker.id,
      whatsapp_config_id: args.whatsappConfigId,
      remote_chat_id: args.remoteChatId,
      status: 'active',
      last_message_at: new Date().toISOString(),
    },
    { onConflict: 'account_id,whatsapp_config_id,remote_chat_id' }
  );

  const normalizedText = normalize(args.text);
  if (/^(sim|s|ok|confirmo|consigo|pode ser|aceito)\b/.test(normalizedText)) {
    const result = await args.db.rpc('studiosp_respond_assignment_offer', {
      p_offer_id: offer.id,
      p_action: 'accept',
      p_reason_id: null,
      p_notes: args.text,
      p_broker_profile_id: broker.id,
      p_idempotency_key: `broker-wa:${offer.id}:accept`,
    });
    if (result.error)
      await createOperationalAttention(
        args.db,
        args.accountId,
        offer,
        result.error.message
      );
    else
      await safeReply(
        args,
        'Perfeito. A reunião foi confirmada e já está na sua agenda do Studiosp.'
      );
    return true;
  }

  const transfer = /transfer|outro corretor|outra pessoa/.test(normalizedText);
  const rejection = /^(nao|n|não)\b/.test(normalizedText) || transfer;
  if (rejection) {
    const category = transfer ? 'transfer' : 'broker_rejection';
    const preferredCode = /conflito|agenda|horario/.test(normalizedText)
      ? 'schedule_conflict'
      : /indispon|imprevisto/.test(normalizedText)
        ? 'temporary_unavailability'
        : /carga|lotado|muitos/.test(normalizedText)
          ? 'workload'
          : 'other';
    let reason = await args.db
      .from('reason_definitions')
      .select('id')
      .eq('account_id', args.accountId)
      .eq('category', category)
      .eq('code', preferredCode)
      .eq('is_active', true)
      .maybeSingle();
    if (!reason.data) {
      reason = await args.db
        .from('reason_definitions')
        .select('id')
        .eq('account_id', args.accountId)
        .eq('category', category)
        .eq('code', 'other')
        .eq('is_active', true)
        .maybeSingle();
    }
    const result = await args.db.rpc('studiosp_respond_assignment_offer', {
      p_offer_id: offer.id,
      p_action: transfer ? 'transfer' : 'reject',
      p_reason_id: reason.data?.id ?? null,
      p_notes: args.text || 'Resposta recebida pelo WhatsApp do corretor.',
      p_broker_profile_id: broker.id,
      p_idempotency_key: `broker-wa:${offer.id}:${transfer ? 'transfer' : 'reject'}`,
    });
    if (result.error)
      await createOperationalAttention(
        args.db,
        args.accountId,
        offer,
        result.error.message
      );
    else
      await safeReply(
        args,
        transfer
          ? 'Entendido. Vou procurar outro corretor e o motivo ficou registrado.'
          : 'Entendido. A rejeição e o motivo ficaram registrados.'
      );
    return true;
  }

  await safeReply(
    args,
    'Tenho um convite de reunião aguardando sua resposta. Responda “sim” para aceitar, “não + motivo” para rejeitar ou “transferir + motivo”.'
  );
  return true;
}

async function safeReply(
  args: Parameters<typeof handleBrokerOperationalReply>[0],
  text: string
) {
  try {
    await sendProviderText({
      config: args.providerConfig,
      to: args.phone,
      text,
    });
  } catch (error) {
    console.error(
      '[Studiosp/corretor] resposta operacional não enviada:',
      error
    );
  }
}

async function createOperationalAttention(
  db: SupabaseClient,
  accountId: string,
  offer: Row,
  error: string
) {
  const { data: appointment } = await db
    .from('appointments')
    .select('opportunity_id')
    .eq('id', offer.appointment_id)
    .maybeSingle();
  await upsertOwnerAttention(db, {
    accountId,
    opportunityId: appointment?.opportunity_id ?? null,
    kind: 'broker_whatsapp_error',
    severity: 'critical',
    title: 'Resposta do corretor precisa de revisão',
    context: { offer_id: offer.id, error: error.slice(0, 300) },
    dueAt: new Date().toISOString(),
    deduplicationKey: `broker-whatsapp-error:${offer.id}`,
  });
}

function normalize(value: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}
