import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
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
  if (['numero', 'telefone', 'celular', 'phone', 'whatsapp'].includes(k))
    return 'phone';
  if (k === 'email' || k === 'emailopcional') return 'email';
  if (['objetivoprincipal', 'objetivo', 'finalidade'].includes(k))
    return 'objective';
  if (['valorentrada', 'entrada', 'valordeentrada'].includes(k))
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
  if (k.includes('moradia') || k.includes('morar')) return 'live';
  if (k.includes('invest')) return 'invest';
  if (k.includes('ambos')) return 'both';
  return 'unknown';
};
const money = (v: string) => {
  const c = v.replace(/[^\d,.-]/g, '');
  if (!c) return null;
  const n = Number(
    c.includes(',') ? c.replace(/\./g, '').replace(',', '.') : c
  );
  return Number.isFinite(n) && n >= 0 ? n : null;
};
export async function parseReactivationFile(file: File) {
  const wb = new ExcelJS.Workbook();
  const bytes = Buffer.from(await file.arrayBuffer());
  if (file.name.toLowerCase().endsWith('.csv')) {
    const firstLine = bytes.toString('utf8').split(/\r?\n/, 1)[0] ?? '';
    const delimiter =
      (firstLine.match(/;/g)?.length ?? 0) >
      (firstLine.match(/,/g)?.length ?? 0)
        ? ';'
        : ',';
    await wb.csv.read(Readable.from(bytes), {
      parserOptions: { delimiter },
    });
  } else await wb.xlsx.load(bytes as never);
  const sheet = wb.worksheets[0];
  if (!sheet) throw new Error('A planilha não possui aba legível.');
  const headers = new Map<number, string>();
  sheet.getRow(1).eachCell((c, i) => {
    const f = field(c.text);
    if (f) headers.set(i, f);
  });
  if (![...headers.values()].includes('phone'))
    throw new Error('A coluna “Número” é obrigatória.');
  const out: ReactivationRow[] = [];
  sheet.eachRow((r, rowNumber) => {
    if (rowNumber === 1) return;
    const v: Record<string, string> = {};
    headers.forEach((f, i) => (v[f] = r.getCell(i).text.trim()));
    if (!Object.values(v).some(Boolean)) return;
    const p = phone(v.phone ?? '');
    const notes: string[] = [];
    if (/^\s*[\d.,]+\s*e[+-]?\d+\s*$/i.test(v.phone ?? ''))
      notes.push(
        'Número em notação científica. No Excel, formate a coluna como Texto e exporte novamente.'
      );
    else if (!p) notes.push('Número inválido.');
    if (!v.name) notes.push('Nome ausente.');
    if (!v.objective) notes.push('Objetivo ausente.');
    if (!v.entryValue) notes.push('Valor de entrada ausente.');
    out.push({
      rowNumber,
      name: v.name || null,
      phoneE164: p,
      email: v.email || null,
      objective: objective(v.objective ?? ''),
      entryValue: money(v.entryValue ?? ''),
      rawData: v,
      notes,
    });
  });
  return out;
}
