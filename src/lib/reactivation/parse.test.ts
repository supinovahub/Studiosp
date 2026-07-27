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

  it('aceita CSV separado por ponto e vírgula', async () => {
    const file = new File(
      [
        'nome;número;email;objetivo principal;valor entrada\n' +
          'Ana;5527999990000;ana@example.com;investimento;100000\n',
      ],
      'base.csv',
      { type: 'text/csv' }
    );

    const [row] = await parseReactivationFile(file);

    expect(row).toMatchObject({
      name: 'Ana',
      phoneE164: '+5527999990000',
      objective: 'invest',
      entryValue: 100000,
    });
  });

  it('aceita CSV do Excel em Windows-1252', async () => {
    const csv =
      'nome;número;email;objetivo principal;valor entrada\r\n' +
      'Ana;5527999990000;;moradia;80000\r\n';
    const bytes = Buffer.from(csv, 'latin1');
    const file = new File([bytes], 'excel.csv', { type: 'text/csv' });

    const [row] = await parseReactivationFile(file);

    expect(row).toMatchObject({
      name: 'Ana',
      phoneE164: '+5527999990000',
      objective: 'live',
      entryValue: 80000,
    });
  });

  it('rejeita telefone em notação científica com orientação clara', async () => {
    const file = new File(
      [
        'nome;número;email;objetivo principal;valor entrada\n' +
          'Arthur;5,52798E+12;arthur@example.com;investimento;100000\n',
      ],
      'base.csv',
      { type: 'text/csv' }
    );

    const [row] = await parseReactivationFile(file);

    expect(row.phoneE164).toBeNull();
    expect(row.notes.join(' ')).toContain('notação científica');
  });

  it('aceita o formato exportado pela base de leads e preserva as colunas originais', async () => {
    const csv = [
      [
        'Lead ID',
        'Nome',
        'Telefone principal',
        'Outros telefones',
        'E-mail principal',
        'Principal objetivo',
        'STUDIOS | você_já_investiu_em_studios?',
        'STUDIOS | qual_é_o_seu_principal_objetivo?',
        'STUDIOS | qual_valor_de_entrada_é_seu_limite?',
        'STUDIOS | qual_valor_de_parcela_é_o_seu_limite?',
        'Corretor',
      ].join(';'),
      [
        'LEAD-0013',
        'Marcelo Arruda',
        '+55 (81) 99797-1507',
        '',
        'marcelo@example.com',
        'rentabilizar_com_aluguel_',
        'não',
        'rentabilizar_com_aluguel_',
        '100k',
        'até_4k',
        'Pedro',
      ].join(';'),
    ].join('\n');
    const file = new File([csv], 'Leads - 100.csv', { type: 'text/csv' });

    const [row] = await parseReactivationFile(file);

    expect(row).toMatchObject({
      name: 'Marcelo Arruda',
      phoneE164: '+5581997971507',
      email: 'marcelo@example.com',
      objective: 'invest',
      entryValue: 100000,
    });
    expect(row.rawData).toMatchObject({
      'Lead ID': 'LEAD-0013',
      Corretor: 'Pedro',
      'STUDIOS | qual_valor_de_parcela_é_o_seu_limite?': 'até_4k',
    });
  });

  it.each([
    ['utilização_própria_', 'live'],
    ['rentabilizar_com_aluguel_', 'invest'],
    ['vender_com_ganho_de_capital_', 'invest'],
  ])('normaliza o objetivo %s como %s', async (source, expected) => {
    const file = new File(
      [
        'Nome;Telefone principal;Principal objetivo;STUDIOS | qual_valor_de_entrada_é_seu_limite?\n' +
          `Ana;+55 (27) 99999-0000;${source};100k\n`,
      ],
      'base.csv',
      { type: 'text/csv' }
    );

    const [row] = await parseReactivationFile(file);

    expect(row.objective).toBe(expected);
    expect(row.entryValue).toBe(100000);
  });

  it('remove do envio um nome visivelmente corrompido', async () => {
    const file = new File(
      [
        'Nome;Telefone principal;Principal objetivo;Valor entrada\n' +
          '??????????????;+55 (27) 99999-0000;utilização_própria_;100k\n',
      ],
      'base.csv',
      { type: 'text/csv' }
    );

    const [row] = await parseReactivationFile(file);

    expect(row.name).toBeNull();
    expect(row.notes.join(' ')).toContain('caracteres corrompidos');
  });
});
