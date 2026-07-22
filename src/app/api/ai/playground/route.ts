import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';
import { loadAiConfig } from '@/lib/ai/config';
import { retrieveKnowledge } from '@/lib/ai/knowledge';
import { generateReply } from '@/lib/ai/generate';
import { buildSystemPrompt } from '@/lib/ai/defaults';
import { latestUserMessage } from '@/lib/ai/query';
import { AiError, type ChatMessage } from '@/lib/ai/types';
import { classifySdrTurn, emptySdrClassification } from '@/lib/ai/sdr-classify';
import { buildSdrTurnContext } from '@/lib/ai/sdr-catalog';

// Keep the tested transcript bounded, mirroring the live context window.
const MAX_TURNS = 20;

/**
 * POST /api/ai/playground  (agent+)
 *
 * Test-chat with the account's agent WITHOUT touching WhatsApp. Runs the
 * exact same path the auto-reply bot uses — knowledge-base retrieval +
 * `auto_reply` system prompt + the configured provider — so what you see
 * here is what a real customer would get. Reads the config even when the
 * master switch is off (requireActive:false) so you can try it before
 * going live. Stateless: the client sends the running transcript each turn.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent');

    const limit = checkRateLimit(
      `ai-playground:${userId}`,
      RATE_LIMITS.aiDraft
    );
    if (!limit.success) return rateLimitResponse(limit);

    const body = await request.json().catch(() => null);
    const rawMessages = Array.isArray(body?.messages) ? body.messages : null;
    if (!rawMessages) {
      return NextResponse.json(
        { error: 'mensagens são obrigatórias' },
        { status: 400 }
      );
    }

    const messages: ChatMessage[] = rawMessages
      .filter(
        (m: unknown): m is ChatMessage =>
          !!m &&
          typeof m === 'object' &&
          ((m as ChatMessage).role === 'user' ||
            (m as ChatMessage).role === 'assistant') &&
          typeof (m as ChatMessage).content === 'string' &&
          (m as ChatMessage).content.trim().length > 0
      )
      .slice(-MAX_TURNS);

    if (messages.length === 0) {
      return NextResponse.json(
        { error: 'Envie uma mensagem para testar o agente.' },
        { status: 400 }
      );
    }

    const config = await loadAiConfig(supabase, accountId, {
      requireActive: false,
    }).catch((err) => {
      console.error('[ai/playground] loadAiConfig error:', err);
      throw new AiError(
        'Não foi possível descriptografar a chave de API salva.',
        {
          code: 'key_decrypt_failed',
          status: 400,
        }
      );
    });
    if (!config) {
      return NextResponse.json(
        {
          error:
            'Nenhum agente configurado ainda. Adicione sua chave de provedor em Configuração.',
          code: 'ai_not_configured',
        },
        { status: 400 }
      );
    }

    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      config,
      latestUserMessage(messages)
    );
    const classification = await classifySdrTurn({ config, messages }).catch(
      () => emptySdrClassification()
    );
    const sdr = await buildSdrTurnContext({
      db: supabase,
      accountId,
      classification,
    });
    const systemPrompt = buildSystemPrompt({
      userPrompt: config.systemPrompt,
      mode: 'auto_reply',
      knowledge,
      catalog: sdr.grounding,
    });

    const { text, handoff } = await generateReply({
      config,
      systemPrompt,
      messages,
    });
    return NextResponse.json({
      reply: text,
      handoff: handoff || classification.requiresHandoff,
      classification,
      products: sdr.products.map((product) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        cover_url: product.product_media[0]?.url ?? null,
      })),
    });
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: 'Falha ao processar a solicitação', code: err.code },
        { status: err.status }
      );
    }
    return toErrorResponse(err);
  }
}
