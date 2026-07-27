import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';

export class ReactivationImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReactivationImportError';
  }
}
export type ReactivationRow = {
  rowNumber: number;
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  objective: 'live' | 'invest' | 'both' | 'unknown';
  entryValue: number | null;
  rawData: Record<string, string>;
  notes: string[];
};
const key = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const field = (v: unknown) => {
  const k = key(v);
  if (['nome', 'name'].includes(k)) return 'name';
  if (
    [
      'numero',
      'telefone',
      'celular',
      'phone',
      'whatsapp',
      'telefoneprincipal',
      'numeroprincipal',
      'celularprincipal',
      'whatsappprincipal',
    ].includes(k)
  )
    return 'phone';
  if (['email', 'emailopcional', 'emailprincipal'].includes(k)) return 'email';
  if (
    [
      'objetivoprincipal',
      'principalobjetivo',
      'objetivo',
      'finalidade',
    ].includes(k) ||
    k.includes('principalobjetivo')
  )
    return 'objective';
  if (
    ['valorentrada', 'entrada', 'valordeentrada'].includes(k) ||
    (k.includes('valor') && k.includes('entrada'))
  )
    return 'entryValue';
  return null;
};
const phone = (v: string) => {
  if (/^\s*[\d.,]+\s*e[+-]?\d+\s*$/i.test(v)) return null;
  let d = v.replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 10 && d.length <= 15 ? `+${d}` : null;
};
const objective = (v: string): ReactivationRow['objective'] => {
  const k = key(v);
  if (
    k.includes('moradia') ||
    k.includes('morar') ||
    k.includes('utilizacaopropria') ||
    k.includes('usoproprio')
  )
    return 'live';
  if (
    k.includes('invest') ||
    k.includes('rentabilizar') ||
    k.includes('aluguel') ||
    k.includes('ganhodecapital') ||
    k.includes('revenda')
  )
    return 'invest';
  if (k.includes('ambos')) return 'both';
  return 'unknown';
};
const money = (v: string) => {
  const normalized = v.trim().toLowerCase();
  const multiplier = /(?:k|mil)\s*$/.test(normalized) ? 1000 : 1;
  const c = normalized.replace(/(?:k|mil)\s*$/, '').replace(/[^\d,.-]/g, '');
  if (!c) return null;
  let numeric = c;
  if (c.includes(',')) {
    numeric = c.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(c)) {
    numeric = c.replace(/\./g, '');
  }
  const n = Number(numeric) * multiplier;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export async function parseReactivationFile(file: File) {
  const wb = new ExcelJS.Workbook();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.csv')) {
    const utf8 = bytes.toString('utf8');
    const csvText = utf8.includes('\uFFFD')
      ? new TextDecoder('windows-1252').decode(bytes)
      : utf8;
    const firstLine = csvText.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] ?? '';
    const delimiter =
      (firstLine.match(/;/g)?.length ?? 0) >
      (firstLine.match(/,/g)?.length ?? 0)
        ? ';'
        : ',';
    await wb.csv.read(Readable.from([csvText]), {
      parserOptions: { delimiter },
    });
  } else await wb.xlsx.load(bytes as never);
  const sheet = wb.worksheets[0];
  if (!sheet)
    throw new ReactivationImportError('A planilha não possui uma aba legível.');
  const headers = new Map<number, string>();
  const originalHeaders = new Map<number, string>();
  sheet.getRow(1).eachCell((c, i) => {
    const original = c.text.trim();
    if (original) originalHeaders.set(i, original);
    const f = field(c.text);
    if (f) headers.set(i, f);
  });
  if (![...headers.values()].includes('phone'))
    throw new ReactivationImportError(
      'A coluna “Número” é obrigatória. Confira o cabeçalho e tente novamente.'
    );
  const out: ReactivationRow[] = [];
  sheet.eachRow((r, rowNumber) => {
    if (rowNumber === 1) return;
    const v: Record<string, string> = {};
    const rawData: Record<string, string> = {};
    originalHeaders.forEach((header, i) => {
      rawData[header] = r.getCell(i).text.trim();
    });
    headers.forEach((f, i) => (v[f] = r.getCell(i).text.trim()));
    if (!Object.values(v).some(Boolean)) return;
    const p = phone(v.phone ?? '');
    const notes: string[] = [];
    if (/^\s*[\d.,]+\s*e[+-]?\d+\s*$/i.test(v.phone ?? ''))
      notes.push(
        'Número em notação científica. No Excel, formate a coluna como Texto e exporte novamente.'
      );
    else if (!p) notes.push('Número inválido.');
    const corruptedName = /\?{3,}/.test(v.name ?? '');
    if (!v.name) notes.push('Nome ausente.');
    else if (corruptedName)
      notes.push(
        'Nome com caracteres corrompidos; a abordagem usará uma saudação sem nome.'
      );
    if (!v.objective) notes.push('Objetivo ausente.');
    if (!v.entryValue) notes.push('Valor de entrada ausente.');
    out.push({
      rowNumber,
      name: corruptedName ? null : v.name || null,
      phoneE164: p,
      email: v.email || null,
      objective: objective(v.objective ?? ''),
      entryValue: money(v.entryValue ?? ''),
      rawData,
      notes,
    });
  });
  return out;
}
