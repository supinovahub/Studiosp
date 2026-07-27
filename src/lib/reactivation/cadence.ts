export type ReactivationCadenceStep = {
  day: number;
};

export type ReactivationMessage = {
  text: string;
  variant: string;
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
  return buildReactivationMessageWithVariant(lead, stepNumber).text;
}

export function buildReactivationMessageWithVariant(
  lead: Record<string, unknown>,
  stepNumber: number
): ReactivationMessage {
  const name = typeof lead.name === 'string' ? lead.name.split(' ')[0] : null;
  const seed = stableSeed(
    [lead.id, lead.campaign_id, lead.phone_e164, lead.name, stepNumber]
      .filter(Boolean)
      .join(':')
  );
  const greetings = name
    ? [`Oi, ${name}!`, `Olá, ${name}!`, `${name}, tudo bem?`, `Oi, ${name}.`]
    : ['Oi! Tudo bem?', 'Olá!', 'Tudo bem?', 'Oi!'];
  const greeting = pick(greetings, seed);

  // Only D0 carries the specialized recovery context. Later touches are
  // deterministic follow-ups; once the lead replies, the regular SDR takes
  // over and every pending touch is cancelled.
  if (stepNumber === 1) {
    const objective =
      lead.objective === 'invest'
        ? 'um studio para investimento em São Paulo'
        : lead.objective === 'live'
          ? 'um studio para morar em São Paulo'
          : 'studios em São Paulo';
    const entryValue =
      typeof lead.entry_value === 'number'
        ? lead.entry_value
            .toLocaleString('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            })
            .replace(/\s+/g, ' ')
        : null;
    const entryPhrases = entryValue
      ? [
          `Na época, a referência de entrada era por volta de ${entryValue}.`,
          `Você havia considerado uma entrada próxima de ${entryValue}.`,
          `O valor de entrada que ficou registrado foi cerca de ${entryValue}.`,
          `Pelo nosso histórico, a entrada avaliada era na faixa de ${entryValue}.`,
        ]
      : [
          'Não encontrei uma faixa de entrada confirmada no histórico.',
          'A faixa de entrada não chegou a ficar definida naquela conversa.',
          'O valor de entrada ficou em aberto no nosso último contato.',
        ];
    const entry = pick(entryPhrases, seed >>> 3);
    const templates = [
      `${greeting} Retomando nosso contato sobre ${objective}: ${entry} Você ainda está avaliando essa possibilidade?`,
      `${greeting} Vi que já conversamos sobre ${objective}. ${entry} Seu plano continua de pé ou mudou desde então?`,
      `${greeting} Estou atualizando os atendimentos anteriores e encontrei seu interesse em ${objective}. ${entry} Posso confirmar se esse cenário ainda faz sentido?`,
      `${greeting} Há algum tempo você avaliou ${objective} com a gente. ${entry} Quer retomar essa busca agora?`,
      `${greeting} Seu contato ficou relacionado à busca por ${objective}. ${entry} Você chegou a comprar ou ainda está pesquisando?`,
      `${greeting} Passando para atualizar uma conversa antiga sobre ${objective}. ${entry} Continuamos a partir dessas informações ou prefere revisar o cenário?`,
      `${greeting} Encontrei aqui seu atendimento anterior sobre ${objective}. ${entry} Esse objetivo ainda é atual?`,
      `${greeting} Queria confirmar uma informação do nosso último contato: o interesse era em ${objective}. ${entry} Isso permanece correto?`,
      `${greeting} Estamos revisando oportunidades para quem já pesquisou ${objective}. ${entry} Faz sentido voltarmos a conversar?`,
      `${greeting} Seu histórico indica interesse em ${objective}. ${entry} Posso atualizar seus dados e verificar o que existe hoje?`,
      `${greeting} Lembrei da sua busca por ${objective} ao revisar nossos atendimentos. ${entry} Você ainda pretende seguir com essa compra?`,
      `${greeting} Antes de encerrar seu atendimento anterior sobre ${objective}, queria checar uma coisa. ${entry} Ainda vale retomarmos o assunto?`,
    ];
    const index = seed % templates.length;
    return { text: templates[index], variant: `reactivation_d0_v${index + 1}` };
  }

  const followupsByStep = [
    [
      `${greeting} Conseguiu ver minha mensagem sobre sua busca por studio? Se quiser, atualizo as informações com você.`,
      `${greeting} Só confirmando se ainda vale retomarmos sua procura por um studio em São Paulo.`,
      `${greeting} Seu cenário mudou desde nosso último contato ou ainda podemos continuar a busca?`,
      `${greeting} Posso revisar rapidamente seu perfil para verificarmos as opções atuais?`,
    ],
    [
      `${greeting} Surgiram novas possibilidades de studios em São Paulo. Quer atualizar seu perfil para eu verificar aderência?`,
      `${greeting} Ainda posso ajudar a retomar sua pesquisa de studios ou prefere deixar para outro momento?`,
      `${greeting} Se a compra ainda estiver nos seus planos, posso conferir o que mudou desde nossa última conversa.`,
      `${greeting} Quer que eu atualize as condições da sua busca antes de consultar as opções disponíveis?`,
    ],
    [
      `${greeting} Vou encerrar esta retomada para não incomodar. Se quiser continuar depois, basta responder por aqui.`,
      `${greeting} Como não tive retorno, vou pausar este contato. A conversa fica disponível caso queira retomar.`,
      `${greeting} Encerrando por enquanto para respeitar seu tempo. Quando fizer sentido voltar a pesquisar, é só me chamar.`,
      `${greeting} Vou deixar sua busca pausada. Se ainda quiser falar sobre studios em São Paulo, responda quando preferir.`,
    ],
  ];
  const groupIndex = Math.min(stepNumber - 2, followupsByStep.length - 1);
  const variants = followupsByStep[groupIndex];
  const index = seed % variants.length;
  return {
    text: variants[index],
    variant: `reactivation_d${stepNumber - 1}_v${index + 1}`,
  };
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(values: T[], seed: number) {
  return values[seed % values.length];
}
