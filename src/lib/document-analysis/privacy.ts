export type PrivacyResult = {
  sanitizedText: string;
  categories: string[];
  count: number;
  blocked: boolean;
};

const DETECTORS: Array<{
  category: string;
  expression: RegExp;
  highRisk?: boolean;
}> = [
  {
    category: 'cpf',
    expression: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    highRisk: true,
  },
  {
    category: 'rg',
    expression: /\b(?:RG|R\.G\.)\s*[:.-]?\s*[0-9A-Z.-]{5,18}\b/gi,
    highRisk: true,
  },
  {
    category: 'email_pessoal',
    expression:
      /\b[A-Z0-9._%+-]+@(?![\w.-]*(?:inc|construtora|imobiliaria|empreendimentos)\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  },
  {
    category: 'telefone_pessoal',
    expression: /(?<!\d)(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}(?!\d)/g,
  },
  {
    category: 'endereco_residencial',
    expression:
      /\b(?:residente|domiciliad[oa]|endereço residencial)\b[^.\n]{0,180}/gi,
    highRisk: true,
  },
  {
    category: 'assinatura',
    expression: /\b(?:assinatura|assinado eletronicamente|signatári[oa])\b/gi,
    highRisk: true,
  },
];

export function sanitizePersonalData(text: string): PrivacyResult {
  let sanitizedText = text;
  const categories = new Set<string>();
  let count = 0;
  let highRiskCount = 0;

  for (const detector of DETECTORS) {
    sanitizedText = sanitizedText.replace(detector.expression, () => {
      categories.add(detector.category);
      count++;
      if (detector.highRisk) highRiskCount++;
      return `[DADO PESSOAL REMOVIDO: ${detector.category.toUpperCase()}]`;
    });
  }

  return {
    sanitizedText,
    categories: [...categories],
    count,
    // Contratos e documentos com vários identificadores pessoais não seguem
    // para um provedor externo. O preview registra apenas o bloqueio.
    blocked: highRiskCount >= 2 || categories.size >= 4,
  };
}

