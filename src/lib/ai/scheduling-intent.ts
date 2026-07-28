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

export function opportunityInvitation(
  value: {
    starts_at?: unknown;
    timezone?: unknown;
  },
  configuredCompletion?: string | null
) {
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
  const safeConfiguredCompletion =
    configuredCompletion?.trim() &&
    !/\b(confirmad[ao]|marcad[ao]|agendad[ao]|reservad[ao]|desconto|unidade garantida)\b/i.test(
      configuredCompletion
    )
      ? configuredCompletion.trim().replace(/\s+/g, ' ')
      : null;
  const introduction =
    safeConfiguredCompletion ??
    'Boa, já entendi melhor o que você busca. Tenho algumas oportunidades que podem fazer sentido. Posso marcar uma conversa de 10 a 15 minutos com um corretor pra te explicar os detalhes?';
  return `${introduction} Tenho disponibilidade para ${formatted}. Esse horário funciona pra você?`;
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
  validation_schema?: unknown;
}) {
  if (!question) return null;
  const prompts: Record<string, string> = {
    purchase_objective:
      'Você está buscando esse imóvel pra morar, investir ou um pouco dos dois?',
    preferred_locations:
      'Tem algum bairro ou região de São Paulo que você prefere? Se ainda não souber, tudo bem.',
    entry_budget:
      'Hoje, mais ou menos quanto você conseguiria usar de entrada?',
    monthly_installment_budget:
      'E qual valor de parcela por mês ficaria confortável pra você?',
    total_price_budget:
      'Você já tem um valor total de compra em mente? Se não tiver, sem problema.',
    property_timing: 'Você prefere algo na planta, pronto ou tanto faz?',
    purchase_urgency: 'Você pretende comprar em quanto tempo, mais ou menos?',
  };
  const key = String(question.key ?? '');
  if (prompts[key]) return prompts[key];
  const validation =
    question.validation_schema &&
    typeof question.validation_schema === 'object' &&
    !Array.isArray(question.validation_schema)
      ? (question.validation_schema as Record<string, unknown>)
      : {};
  const configuredExample =
    typeof validation.question_example === 'string'
      ? validation.question_example.trim()
      : '';
  if (configuredExample) return configuredExample;
  const label = String(question.label ?? '').trim();
  return label
    ? `Pra eu entender melhor, me conta sobre ${label.toLocaleLowerCase('pt-BR')}?`
    : null;
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
