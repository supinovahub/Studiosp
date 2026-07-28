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
  state: {
    conv: null as Record<string, unknown> | null,
    autoResponders: [] as { id: string }[],
    claim: true as boolean,
    fingerprintClaim: true as boolean,
    updatePayload: null as Record<string, unknown> | null,
    rpcCalls: [] as { name: string; args: unknown }[],
  },
}));

vi.mock('./config', () => ({ loadAiConfig: h.loadAiConfig }));
vi.mock('./context', () => ({
  buildConversationContext: h.buildConversationContext,
}));
vi.mock('./knowledge', () => ({ retrieveKnowledge: h.retrieveKnowledge }));
vi.mock('./generate', () => ({ generateReply: h.generateReply }));
vi.mock('./sdr-classify', () => ({ classifySdrTurn: h.classifySdrTurn }));
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
vi.mock('@/lib/flows/meta-send', () => ({
  engineSendText: h.engineSendText,
  engineSendMedia: h.engineSendMedia,
}));
vi.mock('./admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      if (table === 'automations') {
        // .select().eq().eq().in().limit() → active auto-responders
        const chain = {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          limit: () =>
            Promise.resolve({ data: h.state.autoResponders, error: null }),
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
          return { eq: () => Promise.resolve({ error: null }) };
        },
      };
    },
    rpc: (name: string, args: unknown) => {
      h.state.rpcCalls.push({ name, args });
      return Promise.resolve({
        data:
          name === 'claim_ai_response_fingerprint'
            ? h.state.fingerprintClaim
            : h.state.claim,
        error: null,
      });
    },
  }),
}));

import { dispatchInboundToAiReply } from './auto-reply';

const ARGS = {
  accountId: 'acct-1',
  conversationId: 'conv-1',
  contactId: 'contact-1',
  configOwnerUserId: 'user-1',
  senderPhone: '5527981168321',
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
  };
  h.state.autoResponders = [];
  h.state.claim = true;
  h.state.fingerprintClaim = true;
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
    opportunityId: null,
    grounding: [],
    reservedAppointment: null,
    outboundOverride: null,
    qualificationComplete: true,
    nextQualificationPrompt: null,
  });
  h.scheduleStudiospFollowups.mockResolvedValue(undefined);
  h.buildSdrTurnContext.mockResolvedValue({
    classification: {},
    products: [],
    grounding: [],
  });
  h.persistSdrClassification.mockResolvedValue(undefined);
  h.generateReply.mockResolvedValue({ text: 'Hello!', handoff: false });
  h.engineSendText.mockResolvedValue({ whatsapp_message_id: 'm1' });
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
    });
    h.generateReply.mockResolvedValue({
      text: 'Um corretor entrará em contato para confirmar.',
      handoff: false,
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
    });
    h.generateReply.mockResolvedValue({
      text: 'Encontrei algumas oportunidades. Vamos agendar uma conversa rápida com um corretor?',
      handoff: false,
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
    h.state.autoResponders = [{ id: 'auto-1' }];
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('does not send when the atomic slot claim loses the race', async () => {
    h.state.claim = false;
    await dispatchInboundToAiReply(ARGS);
    // It still attempts the claim, but the send is skipped.
    expect(h.state.rpcCalls).toHaveLength(1);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('blocks an equivalent response claimed by another job', async () => {
    h.state.fingerprintClaim = false;
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
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

  it('skips when the per-conversation cap is reached', async () => {
    h.state.conv = {
      assigned_agent_id: null,
      ai_autoreply_disabled: false,
      ai_reply_count: 3,
    };
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
  });

  it('skips when there is nothing to reply to', async () => {
    h.buildConversationContext.mockResolvedValue([]);
    await dispatchInboundToAiReply(ARGS);
    expect(h.generateReply).not.toHaveBeenCalled();
    expect(h.engineSendText).not.toHaveBeenCalled();
  });
});

describe('dispatchInboundToAiReply — handoff', () => {
  it('disables auto-reply, writes a summary, and does not send on handoff', async () => {
    h.generateReply.mockResolvedValue({ text: '', handoff: true });
    await dispatchInboundToAiReply(ARGS);
    expect(h.engineSendText).not.toHaveBeenCalled();
    expect(h.state.rpcCalls).toHaveLength(0);
    expect(h.state.updatePayload).toMatchObject({
      ai_autoreply_disabled: true,
    });
    expect(h.state.updatePayload?.ai_handoff_summary).toContain(
      'AI agent handed off'
    );
    // No handoff target configured → conversation left unassigned.
    expect(h.state.updatePayload).not.toHaveProperty('assigned_agent_id');
  });

  it('routes to the configured handoff agent on handoff', async () => {
    h.loadAiConfig.mockResolvedValue(aiConfig({ handoffAgentId: 'agent-7' }));
    h.generateReply.mockResolvedValue({ text: '', handoff: true });
    await dispatchInboundToAiReply(ARGS);
    expect(h.state.updatePayload).toMatchObject({
      ai_autoreply_disabled: true,
      assigned_agent_id: 'agent-7',
    });
  });
});
