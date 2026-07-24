import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseReactivationFile } from './parse';

async function workbookFile(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Leads').addRows(rows);
  const bytes = await workbook.xlsx.writeBuffer();
  return new File([bytes as ArrayBuffer], 'base.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('parseReactivationFile', () => {
  it('normaliza cabeçalhos, telefone, objetivo e valor em pt-BR', async () => {
    const file = await workbookFile([
      ['Nome', 'Número', 'Email', 'Objetivo principal', 'Valor entrada'],
      ['Ana', '(27) 99999-0000', 'ana@example.com', 'Moradia', 'R$ 80.000,00'],
      ['Bruno', '5527999991111', '', 'Investimento', '150000'],
    ]);

    const rows = await parseReactivationFile(file);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Ana',
      phoneE164: '+5527999990000',
      objective: 'live',
      entryValue: 80000,
    });
    expect(rows[1]).toMatchObject({
      phoneE164: '+5527999991111',
      objective: 'invest',
      entryValue: 150000,
    });
  });

  it('mantém linha incompleta e sinaliza número inválido', async () => {
    const file = await workbookFile([
      ['Nome', 'numero'],
      ['', '123'],
    ]);

    const [row] = await parseReactivationFile(file);

    expect(row.phoneE164).toBeNull();
    expect(row.objective).toBe('unknown');
    expect(row.notes).toContain('Número inválido.');
  });
});
