export type PrivacyResult = {
  sanitizedText: string;
  analysisText: string;
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

  const highRisk = highRiskCount >= 2 || categories.size >= 4;
  const analysisText = highRisk
    ? commercialOnlyText(sanitizedText)
    : sanitizedText;
  return {
    sanitizedText,
    analysisText,
    categories: [...categories],
    count,
    // Conteúdo de alto risco só segue quando ainda existe contexto comercial
    // suficiente após a remoção integral dos trechos pessoais.
    blocked: highRisk && analysisText.trim().length < 120,
  };
}

function commercialOnlyText(text: string) {
  const sensitiveContext =
    /\b(?:cpf|r\.?g\.?|comprador|adquirente|testemunha|assinatura|signat[aá]ri[oa]|nacionalidade|estado civil|residente|domiciliad[oa]|dados pessoais)\b/i;
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.includes('[DADO PESSOAL REMOVIDO:') &&
        !sensitiveContext.test(line)
    )
    .join('\n')
    .slice(0, 240_000);
}
