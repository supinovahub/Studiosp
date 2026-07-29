import { describe, expect, it } from 'vitest';
import {
  availabilityReply,
  appointmentConfirmation,
  appointmentReservationFailure,
  closestAvailableSlotReply,
  findExactRequestedSlot,
  guardPrematureMeetingOffer,
  isAvailabilityInquiry,
  isOfferedSlotRejection,
  opportunityInvitation,
  qualificationQuestionPrompt,
  requestedStartFromExtraction,
  schedulePreferenceQuestion,
} from './scheduling-intent';

describe('scheduling intent', () => {
  it('asks for a preferred day and time after rejecting an offered slot', () => {
    expect(
      isOfferedSlotRejection('Não consigo nesse horário', ['slot-1'])
    ).toBe(true);
    expect(isOfferedSlotRejection('Não', [])).toBe(false);
    expect(schedulePreferenceQuestion()).toBe(
      'Sem problema. Qual seria o melhor dia e horário para você?'
    );
  });

  it('offers the closest available time on the requested day', () => {
    expect(
      closestAvailableSlotReply({
        starts_at: '2026-07-30T18:30:00.000Z',
      })
    ).toContain('15:30');
  });

  it('accepts a valid ISO instant and rejects an invalid value', () => {
    expect(
      requestedStartFromExtraction('2026-07-28T10:00:00-03:00')?.toISOString()
    ).toBe('2026-07-28T13:00:00.000Z');
    expect(requestedStartFromExtraction('amanhã às dez')).toBeNull();
  });

  it('matches only a real slot near the requested instant', () => {
    const slots = [
      { id: '09', starts_at: '2026-07-28T12:00:00.000Z' },
      { id: '10', starts_at: '2026-07-28T13:00:00.000Z' },
    ];
    expect(
      findExactRequestedSlot(slots, new Date('2026-07-28T10:00:00-03:00'))?.id
    ).toBe('10');
    expect(
      findExactRequestedSlot(slots, new Date('2026-07-28T10:30:00-03:00'))
    ).toBeNull();
  });

  it('builds a deterministic confirmation only from an appointment', () => {
    expect(
      appointmentConfirmation({
        starts_at: '2026-07-28T13:00:00.000Z',
        timezone: 'America/Sao_Paulo',
      })
    ).toContain('terça-feira, 28/07, 10:00');
    expect(
      appointmentConfirmation({
        starts_at: '2026-07-28T13:00:00.000Z',
        timezone: 'America/Sao_Paulo',
      })
    ).toContain('10 a 15 minutos');
    expect(appointmentConfirmation({ starts_at: null })).toBeNull();
  });

  it('offers some opportunities independently from the catalog count', () => {
    expect(
      opportunityInvitation({
        starts_at: '2026-07-28T16:15:00.000Z',
        timezone: 'America/Sao_Paulo',
      })
    ).toBe(
      'Boa, já entendi melhor o que você busca. Tenho algumas oportunidades que podem fazer sentido. Posso marcar uma conversa de 10 a 15 minutos com um corretor pra te explicar os detalhes? Tenho disponibilidade para terça-feira, 28/07, 13:15. Esse horário funciona pra você?'
    );
  });

  it('uses the safe completion wording configured by the owner', () => {
    expect(
      opportunityInvitation(
        {
          starts_at: '2026-07-28T16:15:00.000Z',
          timezone: 'America/Sao_Paulo',
        },
        'Seu perfil ficou completo. Posso te explicar os próximos passos?'
      )
    ).toContain(
      'Seu perfil ficou completo. Posso te explicar os próximos passos? Tenho disponibilidade'
    );
    expect(
      opportunityInvitation(
        {
          starts_at: '2026-07-28T16:15:00.000Z',
          timezone: 'America/Sao_Paulo',
        },
        'Sua reunião está confirmada.'
      )
    ).not.toContain('confirmada');
  });

  it('uses a deterministic failure instead of claiming a reservation', () => {
    expect(appointmentReservationFailure()).not.toMatch(
      /confirmad|agendad|reservad/i
    );
  });

  it('distinguishes an availability inquiry from an exact acceptance', () => {
    expect(isAvailabilityInquiry('Hoje você tem quais horários?')).toBe(true);
    expect(isAvailabilityInquiry('Tem horário disponível pra quando?')).toBe(
      true
    );
    expect(isAvailabilityInquiry('Pode ser às 14h15')).toBe(false);
  });

  it('blocks a meeting offer while qualification is incomplete', () => {
    const next = qualificationQuestionPrompt({
      key: 'monthly_installment_budget',
    })!;
    expect(
      guardPrematureMeetingOffer(
        'Encontrei opções. Vamos agendar uma conversa rápida com o corretor?',
        false,
        next
      )
    ).toBe(next);
    expect(
      guardPrematureMeetingOffer(
        'Encontrei opções. Vamos agendar uma conversa rápida com o corretor?',
        true,
        next
      )
    ).toContain('agendar');
  });

  it('blocks opportunity and bate-papo wording while qualification is incomplete', () => {
    const next = qualificationQuestionPrompt({ key: 'purchase_urgency' })!;
    expect(
      guardPrematureMeetingOffer(
        'Temos algumas oportunidades. Quarta às 17:00 funciona pra um bate-papo?',
        false,
        next
      )
    ).toBe(next);
  });

  it('uses the configured example only as the deterministic custom fallback', () => {
    expect(
      qualificationQuestionPrompt({
        key: 'custom_move_reason',
        label: 'Motivo da mudança',
        prompt_instruction:
          'Entenda o que levou o lead a procurar neste momento.',
        validation_schema: {
          question_example: 'O que fez você começar a procurar agora?',
        },
      })
    ).toBe('O que fez você começar a procurar agora?');
  });

  it('answers availability but resumes qualification before reserving', () => {
    expect(
      availabilityReply({
        latestMessage: 'Hoje você tem quais horários?',
        nextQuestion:
          'Qual faixa de parcela mensal ficaria confortável para você?',
        now: new Date('2026-07-28T14:33:45.000Z'),
        slots: [
          { starts_at: '2026-07-28T16:45:00.000Z' },
          { starts_at: '2026-07-28T17:00:00.000Z' },
          { starts_at: '2026-07-28T17:15:00.000Z' },
        ],
      })
    ).toBe(
      'Tenho disponibilidade hoje às 13:45, 14:00 e 14:15. Antes de reservar, preciso concluir seu perfil. Qual faixa de parcela mensal ficaria confortável para você?'
    );
  });
});
