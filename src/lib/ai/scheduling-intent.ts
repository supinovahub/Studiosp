type Slot = { id?: unknown; starts_at?: unknown };

const MEETING_OFFER_PATTERN =
  /\b(agend\w*|marc\w*|reserv\w*|reuni[aã]o|conversa\s+r[aá]pida|bate[\s-]*papo|oportunidades?|falar\s+com\s+(?:um\s+)?corretor)\b/i;

const AVAILABILITY_INQUIRY_PATTERN =
  /\b(disponibilidade|dispon[ií]ve(?:l|is)|quais?\s+hor[aá]rios?|hor[aá]rios?\s+(?:tem|t[eê]m|dispon[ií]ve(?:l|is))|tem\s+hor[aá]rio|tem\s+algo(?:\s+\w+){0,3}\s+hor[aá]rio|algo\s+(?:de\s+)?(?:manh[aã]|tarde|noite)|pra\s+quando|para\s+quando)\b/i;

export type SchedulingPeriod = 'morning' | 'afternoon' | 'evening';

export interface SchedulingPreference {
  dayKey?: string | null;
  period?: SchedulingPeriod | null;
  requestedStartAt?: string | null;
}

function saoPauloDay(value: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function localHour(value: Date) {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(value)
  );
}

function periodForHour(hour: number): SchedulingPeriod {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

export function deriveSchedulingPreference(args: {
  latestMessage: string;
  extractedStart?: unknown;
  previous?: SchedulingPreference | null;
  now?: Date;
}): SchedulingPreference {
  const normalized = args.latestMessage
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
  const extracted = requestedStartFromExtraction(args.extractedStart);
  const now = args.now ?? new Date();
  let dayKey = args.previous?.dayKey ?? null;
  let period = args.previous?.period ?? null;
  let requestedStartAt = args.previous?.requestedStartAt ?? null;

  if (extracted) {
    dayKey = saoPauloDay(extracted);
    period = periodForHour(localHour(extracted));
    requestedStartAt = extracted.toISOString();
  } else {
    if (/\bhoje\b/.test(normalized)) dayKey = saoPauloDay(now);
    if (/\bamanha\b/.test(normalized)) {
      dayKey = saoPauloDay(new Date(now.getTime() + 86_400_000));
    }
    if (/\b(?:de\s+)?manha\b/.test(normalized)) period = 'morning';
    if (/\b(?:a\s+|de\s+)?tarde\b/.test(normalized)) period = 'afternoon';
    if (/\b(?:a\s+|de\s+)?noite\b/.test(normalized)) period = 'evening';
  }

  return { dayKey, period, requestedStartAt };
}

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

export function isOfferedSlotRejection(
  value: string,
  offeredSlotIds: string[] = []
) {
  if (!offeredSlotIds.length) return false;
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
  return (
    /\b(nao consigo|nao posso|nao funciona|nao da|outro horario|outro dia|melhor outro|nenhum desses|nao nesse|esse nao)\b/.test(
      normalized
    ) || /^(nao|n|negativo)\b/.test(normalized.trim())
  );
}

export function schedulePreferenceQuestion() {
  return 'Sem problema. Qual seria o melhor dia e horário para você?';
}

export function closestAvailableSlotReply(slot: Slot) {
  if (typeof slot.starts_at !== 'string') return null;
  const start = new Date(slot.starts_at);
  if (!Number.isFinite(start.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  }).format(start);
  return `Nesse dia, o horário disponível mais próximo é ${formatted}. Esse horário funciona para você?`;
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
  preference?: SchedulingPreference | null;
  now?: Date;
}) {
  const effective = selectAvailabilitySlots(args);
  if (!effective.length) {
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

export function selectAvailabilitySlots<T extends Slot>(args: {
  slots: T[];
  latestMessage: string;
  preference?: SchedulingPreference | null;
  now?: Date;
}): Array<T & { starts_at: string }> {
  const usable = args.slots.filter(
    (slot): slot is T & { starts_at: string } =>
      typeof slot.starts_at === 'string' &&
      Number.isFinite(new Date(slot.starts_at).getTime())
  );
  if (!usable.length) return [];

  const timezone = 'America/Sao_Paulo';
  const now = args.now ?? new Date();
  const localDay = (value: Date) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(value);
  const preference = deriveSchedulingPreference({
    latestMessage: args.latestMessage,
    previous: args.preference,
    now,
  });
  let selected = usable;
  if (preference.dayKey) {
    selected = selected.filter(
      (slot) => localDay(new Date(slot.starts_at)) === preference.dayKey
    );
  }
  if (preference.period) {
    selected = selected.filter(
      (slot) =>
        periodForHour(localHour(new Date(slot.starts_at))) === preference.period
    );
  }
  const hasExplicitPreference = Boolean(preference.dayKey || preference.period);
  return (hasExplicitPreference ? selected : usable).slice(0, 3);
}
