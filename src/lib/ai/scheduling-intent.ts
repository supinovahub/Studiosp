type Slot = { id?: unknown; starts_at?: unknown };

export function requestedStartFromExtraction(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function findExactRequestedSlot<T extends Slot>(
  slots: T[],
  requested: Date | null,
  toleranceMs = 5 * 60_000
): T | null {
  if (!requested) return null;
  return (
    slots.find((slot) => {
      if (typeof slot.starts_at !== 'string') return false;
      const startsAt = new Date(slot.starts_at).getTime();
      return (
        Number.isFinite(startsAt) &&
        Math.abs(startsAt - requested.getTime()) <= toleranceMs
      );
    }) ?? null
  );
}

export function appointmentConfirmation(value: {
  starts_at?: unknown;
  timezone?: unknown;
}) {
  if (typeof value.starts_at !== 'string') return null;
  const startsAt = new Date(value.starts_at);
  if (!Number.isFinite(startsAt.getTime())) return null;
  const timezone =
    typeof value.timezone === 'string' ? value.timezone : 'America/Sao_Paulo';
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(startsAt);
  return `Sua conversa de 10 a 15 minutos está confirmada para ${formatted}. Agora faremos a distribuição interna para um dos nossos corretores. Você receberá um lembrete antes da reunião.`;
}

export function opportunityInvitation(value: {
  starts_at?: unknown;
  timezone?: unknown;
}) {
  if (typeof value.starts_at !== 'string') return null;
  const startsAt = new Date(value.starts_at);
  if (!Number.isFinite(startsAt.getTime())) return null;
  const timezone =
    typeof value.timezone === 'string' ? value.timezone : 'America/Sao_Paulo';
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  }).format(startsAt);
  return `Encontrei algumas oportunidades de acordo com o seu perfil. Posso agendar uma conversa de 10 a 15 minutos com um corretor para apresentar os detalhes? Tenho disponibilidade para ${formatted}. Esse horário funciona para você?`;
}

export function appointmentReservationFailure() {
  return 'Não consegui concluir a reserva desse horário agora. Vou deixar o caso para revisão da equipe e você receberá a confirmação por aqui.';
}
