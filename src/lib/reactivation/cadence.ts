export type ReactivationCadenceStep = {
  day: number;
};

export const DEFAULT_REACTIVATION_CADENCE: ReactivationCadenceStep[] = [
  { day: 0 },
  { day: 2 },
  { day: 5 },
  { day: 9 },
];

export class ReactivationCadenceError extends Error {}

export function parseReactivationCadence(
  value: unknown
): ReactivationCadenceStep[] {
  const source =
    typeof value === 'string'
      ? value
          .split(',')
          .map((day) => day.trim())
          .filter(Boolean)
      : value;
  if (!Array.isArray(source)) {
    throw new ReactivationCadenceError(
      'Informe a cadência como uma lista de dias.'
    );
  }

  const days = source.map((item) =>
    typeof item === 'object' && item !== null && 'day' in item
      ? Number(item.day)
      : Number(item)
  );
  if (
    days.length < 1 ||
    days.length > 4 ||
    days.some((day) => !Number.isInteger(day) || day < 0 || day > 90)
  ) {
    throw new ReactivationCadenceError(
      'A cadência deve ter de 1 a 4 dias inteiros entre D0 e D90.'
    );
  }

  const unique = [...new Set(days)].sort((left, right) => left - right);
  if (unique.length !== days.length) {
    throw new ReactivationCadenceError('A cadência não pode repetir dias.');
  }
  if (unique[0] !== 0) {
    throw new ReactivationCadenceError(
      'A primeira abordagem da campanha deve acontecer em D0.'
    );
  }

  return unique.map((day) => ({ day }));
}

export function buildReactivationMessage(
  lead: Record<string, unknown>,
  stepNumber: number
): string {
  const name = typeof lead.name === 'string' ? lead.name.split(' ')[0] : null;
  const greeting = name ? `Oi, ${name}!` : 'Oi!';

  // Only D0 carries the specialized recovery context. Later touches are
  // deterministic follow-ups; once the lead replies, the regular SDR takes
  // over and every pending touch is cancelled.
  if (stepNumber === 1) {
    const objective =
      lead.objective === 'invest'
        ? 'investir em um studio em São Paulo'
        : lead.objective === 'live'
          ? 'comprar um studio para morar em São Paulo'
          : 'comprar um studio em São Paulo';
    const entry =
      typeof lead.entry_value === 'number'
        ? ` Você tinha considerado uma entrada próxima de ${lead.entry_value.toLocaleString(
            'pt-BR',
            { style: 'currency', currency: 'BRL' }
          )}.`
        : '';
    return `${greeting} Nós já conversamos em outro momento sobre ${objective}.${entry} Isso ainda faz sentido para você?`;
  }

  const followups = [
    `${greeting} Passando para confirmar se você ainda está buscando um studio em São Paulo. Posso retomar de onde paramos?`,
    `${greeting} Surgiram novas possibilidades para quem está avaliando studios em São Paulo. Quer que eu atualize seu perfil e veja o que combina com seu momento?`,
    `${greeting} Vou encerrar esta retomada para não incomodar. Se ainda quiser conversar sobre studios em São Paulo, é só responder por aqui.`,
  ];
  return followups[Math.min(stepNumber - 2, followups.length - 1)];
}
