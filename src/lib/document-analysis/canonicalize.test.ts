import { describe, expect, it } from 'vitest';
import {
  canonicalizeAnalysis,
  normalizeToken,
  parseDate,
  parseLocalizedNumber,
  parseLocalizedRange,
} from './canonicalize';

describe('normalização documental canônica', () => {
  it.each([
    ['R$ 1.234.567,89', 1_234_567.89],
    ['1.234', 1_234],
    ['35,50 m²', 35.5],
    ['450000.00', 450_000],
    ['R$ 450 mil', 450_000],
    ['R$ 1,2 milhão', 1_200_000],
    [250_000, 250_000],
  ])('converte número localizado %s', (input, expected) => {
    expect(parseLocalizedNumber(input)).toBe(expected);
  });

  it('separa faixas comerciais expressas em uma única célula', () => {
    expect(parseLocalizedRange('R$ 450 mil a R$ 620 mil')).toEqual([
      450_000, 620_000,
    ]);
    expect(parseLocalizedRange('28,5 até 35 m²')).toEqual([28.5, 35]);
  });

  it('converte datas brasileiras, ISO e mês por extenso', () => {
    expect(parseDate('27/07/2026')).toBe('2026-07-27');
    expect(parseDate('2027-10-31')).toBe('2027-10-31');
    expect(parseDate('OUTUBRO 2027')).toBe('2027-10-01');
    expect(parseDate('31/02/2027')).toBeNull();
  });

  it('normaliza acentos e símbolos sem perder a semântica', () => {
    expect(normalizeToken('Consolação — 35 m²')).toBe('consolacao_35_m2');
  });

  it('traduz aliases, preserva proveniência e vincula a chave da oferta ao pai', () => {
    const result = canonicalizeAnalysis(
      [
        {
          type: 'development',
          action: 'create',
          displayName: 'Projeto',
          confidence: 0.95,
          parentIndex: null,
          fields: [
            {
              name: 'Empreendimento',
              value: 'Nex One',
              confidence: 0.9,
              page: 3,
              excerpt: 'Nex One',
            },
            {
              name: 'Incorporadora',
              value: 'Nex',
              confidence: 0.8,
            },
          ],
        },
        {
          type: 'offer',
          action: 'create',
          displayName: 'Studio',
          confidence: 0.9,
          parentIndex: 0,
          fields: [
            { name: 'Metragem', value: '28,5 m²', confidence: 0.85 },
            { name: 'Preço', value: 'R$ 450.000', confidence: 0.8 },
          ],
        },
      ],
      []
    );

    expect(result.items[0].normalizedKey).toContain('nex_one');
    expect(result.items[0].fields[0]).toMatchObject({
      name: 'name',
      page: 3,
      excerpt: 'Nex One',
    });
    expect(result.items[1].normalizedKey).toContain(
      result.items[0].normalizedKey
    );
    expect(result.items[1].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'area_min_sqm', value: 28.5 }),
        expect.objectContaining({ name: 'price_from', value: 450_000 }),
      ])
    );
  });

  it('bloqueia faixa invertida e sinaliza valores implausíveis', () => {
    const result = canonicalizeAnalysis(
      [
        {
          type: 'offer',
          action: 'create',
          displayName: 'Studio',
          confidence: 0.9,
          parentIndex: null,
          fields: [
            { name: 'area_min_sqm', value: 42, confidence: 0.9 },
            { name: 'area_max_sqm', value: 30, confidence: 0.9 },
            { name: 'price_from', value: 5_000, confidence: 0.6 },
          ],
        },
      ],
      []
    );

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid_area_min_sqm_area_max_sqm',
          severity: 'blocking',
        }),
        expect.objectContaining({
          code: 'implausible_price',
          severity: 'warning',
        }),
      ])
    );
  });

  it('padroniza as partes de endereço usadas pelo catálogo', () => {
    const result = canonicalizeAnalysis(
      [
        {
          type: 'development',
          action: 'create',
          displayName: 'Projeto',
          confidence: 0.9,
          parentIndex: null,
          fields: [
            { name: 'name', value: 'Projeto', confidence: 0.9 },
            {
              name: 'address',
              value: {
                logradouro: 'Rua Exemplo',
                bairro: 'Pinheiros',
                cidade: 'São Paulo',
                uf: 'SP',
              },
              confidence: 0.9,
            },
          ],
        },
      ],
      []
    );

    expect(result.items[0].fields[1].value).toEqual({
      street: 'Rua Exemplo',
      neighborhood: 'Pinheiros',
      city: 'São Paulo',
      state: 'SP',
    });
  });
});
