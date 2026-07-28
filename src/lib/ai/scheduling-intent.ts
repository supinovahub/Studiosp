type Slot = { id?: unknown; starts_at?: unknown };

const MEETING_OFFER_PATTERN =
  /\b(agend\w*|marc\w*|reserv\w*|reuni[aã]o|conversa\s+r[aá]pida|falar\s+com\s+(?:um\s+)?corretor)\b/i;

const AVAILABILITY_INQUIRY_PATTERN =
  /\b(disponibilidade|dispon[ií]ve(?:l|is)|quais?\s+hor[aá]rios?|hor[aá]rios?\s+(?:tem|t[eê]m|dispon[ií]ve(?:l|is))|tem\s+hor[aá]rio|pra\s+quando|para\s+quando)\b/i;

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

export function isAvailabilityInquiry(value: string) {
  return AVAILABILITY_INQUIRY_PATTERN.test(value);
}

export function guardPrematureMeetingOffer(
  generatedText: string,
  qualificationComplete: boolean,
  nextQuestion: string | null
) {
  if (
    qualificationComplete ||
    !nextQuestion ||
    !MEETING_OFFER_PATTERN.test(generatedText)
  ) {
    return generatedText;
  }
  return nextQuestion;
}

export function qualificationQuestionPrompt(question?: {
  key?: unknown;
  label?: unknown;
  prompt_instruction?: unknown;
}) {
  if (!question) return null;
  const prompts: Record<string, string> = {
    purchase_objective:
      'Antes de avançarmos, você procura o imóvel para morar, investir ou combinar os dois objetivos?',
    preferred_locations:
      'Antes de avançarmos, qual bairro ou região de São Paulo você prefere?',
    entry_budget:
      'Antes de avançarmos, qual faixa de entrada você pretende utilizar?',
    monthly_installment_budget:
      'Antes de avançarmos, qual faixa de parcela mensal ficaria confortável para você?',
    total_price_budget:
      'Antes de avançarmos, qual faixa de preço total você está considerando?',
    property_timing:
      'Antes de avançarmos, você prefere imóvel na planta, pronto ou é indiferente?',
    purchase_urgency:
      'Antes de avançarmos, em quanto tempo você pretende realizar a compra?',
  };
  const key = String(question.key ?? '');
  if (prompts[key]) return prompts[key];
  const label = String(question.label ?? '').trim();
  return label ? `Antes de avançarmos, pode me informar: ${label}?` : null;
}

export function availabilityReply(args: {
  slots: Slot[];
  latestMessage: string;
  nextQuestion: string | null;
  now?: Date;
}) {
  const usable = args.slots
    .filter(
      (slot): slot is Slot & { starts_at: string } =>
        typeof slot.starts_at === 'string' &&
        Number.isFinite(new Date(slot.starts_at).getTime())
    )
    .slice(0, 3);
  if (!usable.length) {
    return args.nextQuestion
      ? `Não encontrei um horário disponível dentro da agenda configurada agora. ${args.nextQuestion}`
      : 'Não encontrei um horário disponível dentro da agenda configurada agora.';
  }

  const timezone = 'America/Sao_Paulo';
  const now = args.now ?? new Date();
  const localDay = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  const asksToday = /\bhoje\b/i.test(args.latestMessage);
  const selected = asksToday
    ? usable.filter(
        (slot) => localDay(new Date(slot.starts_at)) === localDay(now)
      )
    : usable;
  const effective = (selected.length ? selected : usable).slice(0, 3);
  const sameDay = effective.every(
    (slot) =>
      localDay(new Date(slot.starts_at)) ===
      localDay(new Date(effective[0].starts_at))
  );
  const time = (value: string) =>
    new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(value));
  const join = (values: string[]) =>
    values.length === 1
      ? values[0]
      : `${values.slice(0, -1).join(', ')} e ${values.at(-1)}`;
  const firstDate = new Date(effective[0].starts_at);
  const dayLabel =
    localDay(firstDate) === localDay(now)
      ? 'hoje'
      : new Intl.DateTimeFormat('pt-BR', {
          weekday: 'long',
          day: '2-digit',
          month: '2-digit',
          timeZone: timezone,
        }).format(firstDate);
  const options = sameDay
    ? `${dayLabel} às ${join(effective.map((slot) => time(slot.starts_at)))}`
    : join(
        effective.map((slot) =>
          new Intl.DateTimeFormat('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: timezone,
          }).format(new Date(slot.starts_at))
        )
      );
  const availability = `Tenho disponibilidade ${options}.`;
  const nextQuestion = args.nextQuestion
    ?.replace(/^Antes de avançarmos,\s*/i, '')
    .replace(/^./, (character) => character.toUpperCase());
  return nextQuestion
    ? `${availability} Antes de reservar, preciso concluir seu perfil. ${nextQuestion}`
    : `${availability} Qual desses horários funciona melhor para você?`;
}
