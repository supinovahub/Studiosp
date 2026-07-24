import { describe, expect, it } from 'vitest';
import { sanitizePersonalData } from './privacy';

describe('sanitizePersonalData', () => {
  it('remove identificadores pessoais antes do provedor externo', () => {
    const result = sanitizePersonalData(
      'Comprador CPF 123.456.789-00, RG 12.345.678-9, email pessoa@gmail.com e telefone (27) 99811-6832.'
    );

    expect(result.sanitizedText).not.toContain('123.456.789-00');
    expect(result.sanitizedText).not.toContain('12.345.678-9');
    expect(result.sanitizedText).not.toContain('pessoa@gmail.com');
    expect(result.sanitizedText).not.toContain('99811-6832');
    expect(result.categories).toEqual(
      expect.arrayContaining(['cpf', 'rg', 'email_pessoal', 'telefone_pessoal'])
    );
    expect(result.blocked).toBe(true);
  });

  it('preserva texto comercial sem dados pessoais', () => {
    const text =
      'Empreendimento Aurora, studios de 30 m² a partir de R$ 350.000.';
    const result = sanitizePersonalData(text);

    expect(result.sanitizedText).toBe(text);
    expect(result.count).toBe(0);
    expect(result.blocked).toBe(false);
  });

  it('mantém somente trechos comerciais seguros de um documento misto', () => {
    const result = sanitizePersonalData(
      [
        'Comprador CPF 123.456.789-00, RG 12.345.678-9.',
        'Assinatura do comprador.',
        'Empreendimento Aurora com apartamentos de 30 m².',
        'Localizado em Pinheiros, São Paulo.',
        'Preço a partir de R$ 350.000 e entrada facilitada.',
      ].join('\n')
    );

    expect(result.analysisText).toContain('Empreendimento Aurora');
    expect(result.analysisText).not.toContain('Comprador');
    expect(result.analysisText).not.toContain('Assinatura');
    expect(result.blocked).toBe(false);
  });
});
