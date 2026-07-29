import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AiConfig } from './types';

// Shared, hoisted mock state so the module mocks can close over it.
const h = vi.hoisted(() => ({
  loadAiConfig: vi.fn(),
  buildConversationContext: vi.fn(),
  retrieveKnowledge: vi.fn(),
  generateReply: vi.fn(),
  classifySdrTurn: vi.fn(),
  prepareStudiospTurn: vi.fn(),
  scheduleStudiospFollowups: vi.fn(),
  buildSdrTurnContext: vi.fn(),
  persistSdrClassification: vi.fn(),
  engineSendText: vi.fn(),
  engineSendMedia: vi.fn(),
  loadTrustedGuidance: vi.fn(),
  loadResolvingGuidance: vi.fn(),
  resolveGuidanceAfterReply: vi.fn(),
  openGuidanceRequest: vi.fn(),
  openOperationalFailure: vi.fn(),
  recordPromptInjectionSignal: vi.fn(),
  loadAiResponseOutboxForJob: vi.fn(),
  prepareAiResponseOutbox: vi.fn(),
  beginAiOutboxPart: vi.fn(),
  markAiOutboxPartSent: vi.fn(),
  markAiOutboxAmbiguous: vi.fn(),
  state: {
    conv: null as Record<string, unknown> | null,
    autoResponders: [] as Record<string, unknown>[],
    automationReplySteps: [] as { id: string }[],
    rateClaim: true as boolean,
    claim: true as boolean,
    fingerprintClaims: [true] as boolean[],
    updatePayload: null as Record<string, unknown> | null,
    rpcCalls: [] as { name: string; args: unknown }[],
  },
}));

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }));
vi.mock('./context', () => ({
  buildConversationContext: h.buildConversationContext,
}));
vi.mock('./knowledge', () => ({ retrieveKnowledge: h.retrieveKnowledge }));
vi.mock('./generate', () => ({
  generateReply: h.generateReply,
  generateReplyWithFallback: h.generateReply,
  isTransientAiError: (error: unknown) =>
    error instanceof Error &&
    ['timeout', 'empty_response', 'rate_limited', 'network_error'].includes(
      (error as Error & { code?: string }).code ?? ''
    ),
}));
vi.mock('./sdr-classify', () => ({
  classifySdrTurn: h.classifySdrTurn,
  emptySdrClassification: () => ({
    primaryIntent: 'other',
    intents: ['other'],
    leadStage: 'new',
    temperature: 'cold',
    score: 0,
    budgetMin: null,
    budgetMax: null,
    preferredCities: [],
    preferredNeighborhoods: [],
    propertyTypes: [],
    minBedrooms: null,
    minAreaM2: null,
    needsParking: null,
    financingInterest: null,
    purchaseTimeframe: null,
    wantsPhotos: false,
    summary: '',
    nextBestAction: '',
    confidence: 0,
    requiresHandoff: false,
  }),
}));
vi.mock('./studiosp-orchestrator', () => ({
  prepareStudiospTurn: h.prepareStudiospTurn,
  scheduleStudiospFollowups: h.scheduleStudiospFollowups,
}));
vi.mock('./sdr-catalog', () => ({
  buildSdrTurnContext: h.buildSdrTurnContext,
}));
vi.mock('./sdr-store', () => ({
  persistSdrClassification: h.persistSdrClassification,
}));
vi.mock('./guidance', () => ({
  loadTrustedGuidance: h.loadTrustedGuidance,
  loadResolvingGuidance: h.loadResolvingGuidance,
  resolveGuidanceAfterReply: h.resolveGuidanceAfterReply,
  openGuidanceRequest: h.openGuidanceRequest,
  openOperationalFailure: h.openOperationalFailure,
  recordPromptInjectionSignal: h.recordPromptInjectionSignal,
}));
vi.mock('./delivery', () => ({
  loadAiResponseOutboxForJob: h.loadAiResponseOutboxForJob,
  prepareAiResponseOutbox: h.prepareAiResponseOutbox,
  beginAiOutboxPart: h.beginAiOutboxPart,
  markAiOutboxPartSent: h.markAiOutboxPartSent,
  markAiOutboxAmbiguous: h.markAiOutboxAmbiguous,
}));
vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: h.engineSendText,
  engineSendMedia: h.engineSendMedia,
}));
vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'automations') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          then: (
            resolve: (value: {
              data: Record<string, unknown>[];
              error: null;
            }) => unknown,
            reject?: (reason: unknown) => unknown
          ) =>
            Promise.resolve({
              data: h.state.autoResponders,
              error: null,
            }).then(resolve, reject),
        };
        return chain;
      }
      if (table === 'automation_steps') {
        const chain = {
          select: () => chain,
          in: () => chain,
          limit: () =>
            Promise.resolve({
              data: h.state.automationReplySteps,
              error: null,
            }),
        };
        return chain;
      }
      if (table === 'messages') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          order: () => chain,
          limit: () => chain,
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'message-1' }, error: null }),
        };
        return chain;
      }
      if (table === 'contacts') {
        const chain = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: () =>
            Promise.resolve({ data: { name: 'Maria' }, error: null }),
        };
        return chain;
      }
      // conversations
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({ data: h.state.conv, error: null }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          h.state.updatePayload = payload;
          const chain = {
            eq: () => chain,
            is: () => Promise.resolve({ error: null }),
            then: (
              resolve: (value: { error: null }) => unknown,
              reject?: (reason: unknown) => unknown
            ) => Promise.resolve({ error: null }).then(resolve, reject),
          };
          return chain;
        },
      };
    },
    rpc: (name: string, args: unknown) => {
      h.state.rpcCalls.push({ name, args });
      return Promise.resolve({
        data:
          name === 'studiosp_claim_ai_account_rate_slot'
            ? h.state.rateClaim
            : name === 'claim_ai_response_fingerprint'
              ? (h.state.fingerprintClaims.shift() ?? true)
              : h.state.claim,
        error: null,
      });
    },
  }),
}));

import {
  alignQualificationQuestion,
  dispatchInboundToAiReply,
} from './auto-reply';

const ARGS = {
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  configOwnerUserId: 'user-1',
  senderPhone: '5527981168321',
  triggerMessageId: 'message-1',
  jobId: 'job-1',
  contextVersion: 1,
};

function aiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    provider: 'openai',
    model: 'gpt-test',
    apiKey: 'sk-test',
    internalPrompt: null,
    communicationPrompt: null,
    isActive: true,
    autoReplyEnabled: true,
    autoReplyMaxPerConversation: 3,
    autoReplyAllowedNumbers: [],
    handoffAgentId: null,
    embeddingsApiKey: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('AI_AUTOREPLY_ALLOWED_NUMBERS', '');
  h.state.conv = {
    assigned_agent_id: null,
    ai_autoreply_disabled: false,
    ai_reply_count: 0,
    ai_context_version: 1,
    ai_control_mode: 'ai_active',
    status: 'open',
  };
  h.state.autoResponders = [];
  h.state.automationReplySteps = [];
  h.state.rateClaim = true;
  h.state.claim = true;
  h.state.fingerprintClaims = [true];
  h.state.updatePayload = null;
  h.state.rpcCalls = [];
  h.loadAiConfig.mockResolvedValue(aiConfig());
  h.buildConversationContext.mockResolvedValue([
    { role: 'user', content: 'hi' },
  ]);
  h.retrieveKnowledge.mockResolvedValue([]);
  h.classifySdrTurn.mockResolvedValue({
    primaryIntent: 'other',
    intents: ['other'],
    leadStage: 'new',
    temperature: 'cold',
    score: 0,
    budgetMin: null,
    budgetMax: null,
    preferredCities: [],
    preferredNeighborhoods: [],
    propertyTypes: [],
    minBedrooms: null,
    minAreaM2: null,
    needsParking: null,
    financingInterest: null,
    purchaseTimeframe: null,
    wantsPhotos: false,
    summary: '',
    nextBestAction: '',
    confidence: 0,
    requiresHandoff: false,
  });
  h.prepareStudiospTurn.mockResolvedValue({
    opportunityId: 'opp-1',
    grounding: [],
    reservedAppointment: null,
    outboundOverride: null,
    qualificationComplete: true,
    nextQualificationPrompt: null,
    semanticContext: {
      version: 1,
      mode: 'qualification',
      expectedQuestionKey: null,
    },
  });
  h.scheduleStudiospFollowups.mockResolvedValue(undefined);
  h.buildSdrTurnContext.mockResolvedValue({
    classification: {},
    products: [],
    grounding: [],
  });
  h.persistSdrClassification.mockResolvedValue(undefined);
  h.generateReply.mockResolvedValue({
    text: 'Hello!',
    handoff: false,
    needsGuidance: false,
  });
  h.engineSendText.mockResolvedValue({
    whatsapp_message_id: 'm1',
    message_id: 'local-m1',
  });
  h.loadTrustedGuidance.mockResolvedValue([]);
  h.loadResolvingGuidance.mockResolvedValue(null);
  h.loadAiResponseOutboxForJob.mockResolvedValue(null);
  h.resolveGuidanceAfterReply.mockResolvedValue(undefined);
  const baseOutbox = {
    id: 'outbox-1',
    account_id: 'acct-1',
    conversation_id: 'conv-1',
    job_id: 'job-1',
    trigger_message_id: 'message-1',
    context_version: 1,
    response_text: 'Hello!',
    parts: ['Hello!'],
    semantic_context: {},
    status: 'pending',
    sent_part_count: 0,
    provider_message_ids: [],
  };
  h.prepareAiResponseOutbox.mockImplementation(
    async (args: { responseText: string; parts: string[] }) => ({
      ...baseOutbox,
      response_text: args.responseText,
      parts: args.parts,
    })
  );
  h.beginAiOutboxPart.mockImplementation(
    async (_db: unknown, outbox: Record<string, unknown>) => ({
      ...outbox,
      status: 'sending',
    })
  );
  h.markAiOutboxPartSent.mockImplementation(
    async ({
      outbox,
      partIndex,
    }: {
      outbox: { parts: string[]; provider_message_ids: string[] };
      partIndex: number;
    }) => ({
      ...outbox,
      status: partIndex + 1 >= outbox.parts.length ? 'sent' : 'pending',
      sent_part_count: partIndex + 1,
      provider_message_ids: [
        ...(outbox.provider_message_ids ?? []),
        `provider-${partIndex}`,
      ],
    })
  );
  h.markAiOutboxAmbiguous.mockResolvedValue(null);
  h.openGuidanceRequest.mockResolvedValue({ id: 'guidance-1' });
  h.openOperationalFailure.mockResolvedValue(undefined);
  h.recordPromptInjectionSignal.mockResolvedValue({
    detected: false,
    severity: 'info',
    signals: [],
  });
});

describe('dispatchInboundToAiReply — eligibility gates', () => {
  it('does not call the provider for a number outside the allowlist', async () => {
    vi.stubEnv('AI_AUTOREPLY_ALLOWED_NUMBERS', '5527998303052');

    await dispatchInboundToAiReply(ARGS);

    expect(h.loadAiConfig).toHaveBeenCalled();
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('claims a slot and sends on the happy path', async () => {
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.rpcCalls.map((call) => call.name)).toEqual([
      'studiosp_claim_ai_account_rate_slot',
      'claim_ai_reply_slot',
      'claim_ai_response_fingerprint',
    ]);
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1', text: 'Hello!' })
    );
  });

  it('sends a long answer in short humanized WhatsApp blocks', async () => {
    h.generateReply.mockResolvedValue({
      text: 'Olá! Encontrei uma opção. Qual bairro você prefere?',
      handoff: false,
      needsGuidance: false,
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.engineSendText).toHaveBeenCalledTimes(1);
    expect(h.engineSendText.mock.calls[0][0].text).toBe(
      'Olá! Encontrei uma opção. Qual bairro você prefere?'
    );
  });

  it('splits content that exceeds a natural WhatsApp block', async () => {
    h.generateReply.mockResolvedValue({
      text: `${'Encontrei oportunidades compatíveis para o seu perfil. '.repeat(
        4
      )}Qual período funciona melhor para você?`,
      handoff: false,
      needsGuidance: false,
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.engineSendText.mock.calls.length).toBeGreaterThan(1);
    expect(
      h.engineSendText.mock.calls.every(
        ([call]) => String(call.text).length <= 180
      )
    ).toBe(true);
  });

  it('uses the database-backed appointment confirmation instead of model copy', async () => {
    h.prepareStudiospTurn.mockResolvedValue({
      opportunityId: 'opp-1',
      grounding: [],
      reservedAppointment: { id: 'appointment-1' },
      outboundOverride:
        'Sua conversa está confirmada para terça-feira, 28/07, 10:00.',
      qualificationComplete: true,
      nextQualificationPrompt: null,
      semanticContext: { version: 1, mode: 'qualification' },
    });
    h.generateReply.mockResolvedValue({
      text: 'Um corretor entrará em contato para confirmar.',
      handoff: false,
      needsGuidance: false,
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Sua conversa está confirmada para terça-feira, 28/07, 10:00.',
      })
    );
  });

  it('replaces a premature meeting offer with the next qualification question', async () => {
    h.prepareStudiospTurn.mockResolvedValue({
      opportunityId: 'opp-1',
      grounding: [],
      reservedAppointment: null,
      outboundOverride: null,
      qualificationComplete: false,
      nextQualificationPrompt:
        'Antes de avançarmos, qual faixa de parcela mensal ficaria confortável para você?',
      semanticContext: {
        version: 1,
        mode: 'qualification',
        expectedQuestionKey: 'monthly_installment_budget',
      },
    });
    h.generateReply.mockResolvedValue({
      text: 'Encontrei algumas oportunidades. Vamos agendar uma conversa rápida com um corretor?',
      handoff: false,
      needsGuidance: false,
    });

    await dispatchInboundToAiReply(ARGS);

    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Antes de avançarmos, qual faixa de parcela mensal ficaria confortável para você?',
      })
    );
  });

  it('grounds the reply in retrieved knowledge', async () => {
    h.retrieveKnowledge.mockResolvedValue(['Returns accepted within 30 days.']);
    await dispatchInboundToAiReply(ARGS);
    expect(h.retrieveKnowledge).toHaveBeenCalled();
    const systemPrompt = h.generateReply.mock.calls[0][0]
      .systemPrompt as string;
    expect(systemPrompt).toContain('Returns accepted within 30 days.');
  });

  it('stands down when an active message-level automation exists', async () => {
    h.state.autoResponders = [
      {
        id: 'auto-1',
        trigger_type: 'new_message_received',
        trigger_config: {},
      },
    ];
    h.state.automationReplySteps = [{ id: 'step-1' }];
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('does not silence the AI because of an unrelated keyword automation', async () => {
    h.state.autoResponders = [
      {
        id: 'auto-1',
        trigger_type: 'keyword_match',
        trigger_config: {
          keywords: ['segunda via'],
          match_type: 'contains',
        },
      },
    ];
    h.state.automationReplySteps = [{ id: 'step-1' }];
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).toHaveBeenCalled();
    expect(h.engineSendText).toHaveBeenCalled();
  });

  it('does not send when the atomic slot claim loses the race', async () => {
    h.state.claim = false;
    await dispatchInboundToAiReply(ARGS);
    // Renova o orçamento uma vez, mas não envia se a segunda disputa falhar.
    expect(h.state.rpcCalls.map((call) => call.name)).toEqual([
      'studiosp_claim_ai_account_rate_slot',
      'claim_ai_reply_slot',
      'claim_ai_reply_slot',
    ]);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('continues the main reply when auxiliary classification fails', async () => {
    h.classifySdrTurn.mockRejectedValueOnce(new Error('empty_response'));

    const result = await dispatchInboundToAiReply(ARGS);

    expect(result).toEqual({ outcome: 'completed' });
    expect(h.engineSendText).toHaveBeenCalled();
    expect(h.openOperationalFailure).not.toHaveBeenCalled();
  });

  it('keeps only the first question instead of escalating a style defect', async () => {
    h.generateReply.mockResolvedValue({
      text: 'Entendi. Qual bairro você prefere? E qual valor pretende investir?',
      handoff: false,
      needsGuidance: false,
    });

    const result = await dispatchInboundToAiReply(ARGS);

    expect(result).toEqual({ outcome: 'completed' });
    expect(h.generateReply).toHaveBeenCalledTimes(1);
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Entendi. Qual bairro você prefere?',
      })
    );
    expect(h.openGuidanceRequest).not.toHaveBeenCalled();
  });

  it('does not resend a durable response already marked as sent', async () => {
    h.loadAiResponseOutboxForJob.mockResolvedValueOnce({
      id: 'outbox-1',
      account_id: 'acct-1',
      conversation_id: 'conv-1',
      job_id: 'job-1',
      trigger_message_id: 'message-1',
      context_version: 1,
      response_text: 'Hello!',
      parts: ['Hello!'],
      semantic_context: {},
      status: 'sent',
      sent_part_count: 1,
      provider_message_ids: ['provider-1'],
    });
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(
      h.state.rpcCalls.some(
        (call) => call.name === 'claim_ai_response_fingerprint'
      )
    ).toBe(false);
  });

  it('repairs a response blocked as a cross-job duplicate before sending', async () => {
    h.state.fingerprintClaims = [false, true];
    h.generateReply
      .mockResolvedValueOnce({
        text: 'Encontrei oportunidades. Posso reservar uma conversa?',
        handoff: false,
        needsGuidance: false,
      })
      .mockResolvedValueOnce({
        text: 'Entendi. O que mudou para você desde a nossa última conversa?',
        handoff: false,
        needsGuidance: false,
      });

    const result = await dispatchInboundToAiReply(ARGS);

    expect(result).toEqual({ outcome: 'completed' });
    expect(
      h.state.rpcCalls.filter(
        (call) => call.name === 'claim_ai_response_fingerprint'
      )
    ).toHaveLength(2);
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Entendi. O que mudou para você desde a nossa última conversa?',
      })
    );
  });

  it('uses the next deterministic qualification question when duplicate repair is unsafe', async () => {
    h.state.fingerprintClaims = [false, false, true];
    h.prepareStudiospTurn.mockResolvedValue({
      opportunityId: 'opp-1',
      grounding: [],
      reservedAppointment: null,
      outboundOverride: null,
      qualificationComplete: false,
      nextQualificationPrompt:
        'Qual faixa de parcela mensal ficaria confortável para você?',
      semanticContext: {
        version: 1,
        mode: 'qualification',
        expectedQuestionKey: 'monthly_installment_budget',
      },
    });
    h.generateReply
      .mockResolvedValueOnce({
        text: 'Você está buscando esse imóvel pra morar, investir ou os dois?',
        handoff: false,
        needsGuidance: false,
      })
      .mockResolvedValueOnce({
        text: 'Você está buscando esse imóvel pra morar, investir ou os dois?',
        handoff: false,
        needsGuidance: false,
      });

    const result = await dispatchInboundToAiReply(ARGS);

    expect(result).toEqual({ outcome: 'completed' });
    expect(h.engineSendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Qual faixa de parcela mensal ficaria confortável para você?',
      })
    );
    expect(h.openOperationalFailure).not.toHaveBeenCalled();
  });

  it('opens a non-blocking incident when a duplicate cannot be safely repaired', async () => {
    h.state.fingerprintClaims = [false];
    h.generateReply
      .mockResolvedValueOnce({
        text: 'Encontrei oportunidades. Posso reservar uma conversa?',
        handoff: false,
        needsGuidance: false,
      })
      .mockRejectedValueOnce(new Error('provider_timeout'));

    const result = await dispatchInboundToAiReply(ARGS);

    expect(result).toEqual({
      outcome: 'failed',
      reason: 'duplicate_response_blocked',
      retryable: false,
    });
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.openOperationalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        reasonCode: 'duplicate_response_blocked',
        blockConversation: false,
      })
    );
  });

  it('skips when AI is off / not configured', async () => {
    h.loadAiConfig.mockResolvedValue(null);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when auto-reply is disabled for the account', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ autoReplyEnabled: false }));
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when a human agent is assigned', async () => {
    h.state.conv = {
      assigned_agent_id: 'agent-9',
      ai_autoreply_disabled: false,
      ai_reply_count: 0,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when auto-reply was disabled on this conversation', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: true,
      ai_reply_count: 0,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('renews the conversational reply budget when the cap is reached', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 3,
      ai_context_version: 1,
      ai_control_mode: 'ai_active',
      status: 'open',
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).toHaveBeenCalled();
  });

  it('skips when there is nothing to reply to', async () => {
    h.buildConversationContext.mockResolvedValue([]);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });
});

describe('dispatchInboundToAiReply — owner guidance', () => {
  it('opens an owner guidance request and does not send on model handoff', async () => {
    h.generateReply.mockResolvedValue({
      text: '',
      handoff: true,
      needsGuidance: false,
    });
    const result = await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.state.rpcCalls.map((call) => call.name)).toEqual([
      'studiosp_claim_ai_account_rate_slot',
      'studiosp_apply_opportunity_event',
    ]);
    expect(h.openGuidanceRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        reasonCode: 'model_safety_handoff',
      })
    );
    expect(result).toEqual({
      outcome: 'waiting_guidance',
      reason: 'awaiting_owner_guidance',
    });
  });

  it('does not assign a broker merely because the model asks for handoff', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ handoffAgentId: 'agent-7' }));
    h.generateReply.mockResolvedValue({
      text: '',
      handoff: true,
      needsGuidance: false,
    });
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.updatePayload).not.toMatchObject({
      assigned_agent_id: 'agent-7',
    });
    expect(h.openGuidanceRequest).toHaveBeenCalled();
  });
});

describe('alignQualificationQuestion', () => {
  it('substitui uma pergunta diferente pela próxima pergunta registrada', () => {
    expect(
      alignQualificationQuestion({
        generatedText: 'Você prefere um imóvel na planta ou pronto para morar?',
        qualificationComplete: false,
        nextQuestion:
          'Hoje, mais ou menos quanto você conseguiria usar de entrada?',
        expectedQuestionKey: 'entry_budget',
      })
    ).toBe('Hoje, mais ou menos quanto você conseguiria usar de entrada?');
  });

  it('preserva uma pergunta alinhada ao campo esperado', () => {
    expect(
      alignQualificationQuestion({
        generatedText: 'Qual faixa de entrada você pretende utilizar?',
        qualificationComplete: false,
        nextQuestion:
          'Hoje, mais ou menos quanto você conseguiria usar de entrada?',
        expectedQuestionKey: 'entry_budget',
      })
    ).toBe('Qual faixa de entrada você pretende utilizar?');
  });
});
