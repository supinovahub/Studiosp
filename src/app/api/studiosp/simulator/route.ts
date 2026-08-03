import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { loadAiConfig } from '@/lib/ai/config';
import { buildConversationContext } from '@/lib/ai/context';
import { buildSystemPrompt } from '@/lib/ai/defaults';
import { generateReplyWithFallback } from '@/lib/ai/generate';
import { retrieveKnowledge } from '@/lib/ai/knowledge';
import { splitAiMessage } from '@/lib/ai/message-parser';
import { latestUserMessage } from '@/lib/ai/query';
import { semanticMessageMetadata } from '@/lib/ai/semantic-context';
import { prepareStudiospTurn } from '@/lib/ai/studiosp-orchestrator';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

type Db = Awaited<ReturnType<typeof requireRole>>['supabase'];

interface SessionRow {
  id: string;
  contact_id: string;
  conversation_id: string;
  opportunity_id: string;
  title: string;
  turn_count: number;
  updated_at: string;
}

async function createSession(db: Db, accountId: string) {
  const sessionResult = await db.rpc('studiosp_get_or_create_simulation', {
    p_account_id: accountId,
  });
  if (sessionResult.error) throw sessionResult.error;
  return sessionResult.data as SessionRow;
}

async function getSession(db: Db, accountId: string, userId: string) {
  const result = await db
    .from('ai_simulation_sessions')
    .select('*')
    .eq('account_id', accountId)
    .eq('owner_user_id', userId)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data as SessionRow | null) ?? createSession(db, accountId);
}

async function serializeSession(db: Db, session: SessionRow) {
  const [messages, opportunity, answers] = await Promise.all([
    db
      .from('messages')
      .select('id, sender_type, content_text, created_at, provider_metadata')
      .eq('conversation_id', session.conversation_id)
      .order('created_at', { ascending: true }),
    db
      .from('opportunities')
      .select(
        'id, stage, attention_state, qualification_status, meeting_status, commercial_status, lead_summary, updated_at'
      )
      .eq('id', session.opportunity_id)
      .single(),
    db
      .from('qualification_answers')
      .select(
        'id, question_id, normalized_value, raw_text, confidence, status, qualification_questions(key, label)'
      )
      .eq('opportunity_id', session.opportunity_id)
      .eq('is_current', true),
  ]);
  if (messages.error) throw messages.error;
  if (opportunity.error) throw opportunity.error;
  if (answers.error) throw answers.error;
  return {
    session,
    messages: messages.data ?? [],
    opportunity: opportunity.data,
    answers: answers.data ?? [],
    externalEffects: false,
  };
}

export async function GET() {
  try {
    const { supabase, accountId, userId } = await requireRole('owner');
    const session = await getSession(supabase, accountId, userId);
    return NextResponse.json(await serializeSession(supabase, session));
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('owner');
    const limit = checkRateLimit(`ai-simulator:${userId}`, RATE_LIMITS.aiDraft);
    if (!limit.success) return rateLimitResponse(limit);
    const body = await request.json().catch(() => null);
    const text = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!text || text.length > 4000) {
      return NextResponse.json(
        { error: 'Digite uma mensagem de até 4.000 caracteres.' },
        { status: 400 }
      );
    }

    const session = await getSession(supabase, accountId, userId);
    const now = new Date().toISOString();
    const inboundResult = await supabase
      .from('messages')
      .insert({
        account_id: accountId,
        conversation_id: session.conversation_id,
        sender_type: 'customer',
        content_type: 'text',
        content_text: text,
        status: 'delivered',
        message_id: `sim-in:${crypto.randomUUID()}`,
        provider_metadata: { simulator: true, external_delivery: false },
      })
      .select('id')
      .single();
    if (inboundResult.error) throw inboundResult.error;
    await supabase
      .from('conversations')
      .update({ last_message_text: text, last_message_at: now })
      .eq('id', session.conversation_id);

    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    });
    if (!config) {
      return NextResponse.json(
        { error: 'Configure as credenciais da IA antes de usar o simulador.' },
        { status: 400 }
      );
    }
    const messages = await buildConversationContext(
      supabase,
      session.conversation_id,
      30
    );
    const operation = await prepareStudiospTurn({
      db: supabase,
      accountId,
      conversationId: session.conversation_id,
      contactId: session.contact_id,
      triggerMessageId: inboundResult.data.id,
      config,
      messages,
      modelMessages: messages,
      simulation: true,
    });
    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      config,
      latestUserMessage(messages)
    );
    const systemPrompt = buildSystemPrompt({
      internalPrompt: config.internalPrompt,
      communicationPrompt: config.communicationPrompt,
      identityName: config.identityName,
      toneConfig: config.toneConfig,
      mode: 'auto_reply',
      knowledge,
      operation: [
        ...operation.grounding,
        'MODO SIMULAÇÃO: produza a mesma resposta ao lead, mas não afirme que notificações externas foram enviadas. Agendamentos são apenas simulados.',
      ],
    });
    const generated = operation.outboundOverride
      ? { text: operation.outboundOverride }
      : await generateReplyWithFallback({ config, systemPrompt, messages });
    const reply = generated.text.trim();
    const parts = splitAiMessage(reply);
    for (const part of parts) {
      const messageResult = await supabase.from('messages').insert({
        account_id: accountId,
        conversation_id: session.conversation_id,
        sender_type: 'bot',
        content_type: 'text',
        content_text: part,
        status: 'sent',
        message_id: `sim-out:${crypto.randomUUID()}`,
        provider_metadata: {
          simulator: true,
          external_delivery: false,
          ...semanticMessageMetadata(operation.semanticContext),
        },
      });
      if (messageResult.error) throw messageResult.error;
    }
    await Promise.all([
      supabase
        .from('conversations')
        .update({
          last_message_text: parts.at(-1) ?? reply,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', session.conversation_id),
      supabase
        .from('ai_simulation_sessions')
        .update({
          turn_count: session.turn_count + 1,
          updated_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', session.id),
    ]);
    return NextResponse.json(
      await serializeSession(supabase, {
        ...session,
        turn_count: session.turn_count + 1,
      })
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE() {
  try {
    const { supabase, accountId, userId } = await requireRole('owner');
    await getSession(supabase, accountId, userId);
    const resetResult = await supabase.rpc('studiosp_reset_simulation', {
      p_account_id: accountId,
    });
    if (resetResult.error) throw resetResult.error;
    return NextResponse.json(
      await serializeSession(supabase, resetResult.data as SessionRow)
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
