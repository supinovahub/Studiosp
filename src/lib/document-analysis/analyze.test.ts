import { describe, expect, it } from 'vitest';
import {
  consolidateChunkAnalyses,
  extractJson,
  splitDocument,
} from './analyze';

describe('extractJson', () => {
  it('aceita JSON válido dentro de bloco markdown', () => {
    expect(extractJson('```json\n{"items":[],"issues":[]}\n```')).toEqual({
      items: [],
      issues: [],
    });
  });

  it('repara resposta com fechamento ausente', () => {
    expect(
      extractJson(
        '{"items":[{"type":"development","displayName":"Aurora"}],"issues":[]'
      )
    ).toEqual({
      items: [{ type: 'development', displayName: 'Aurora' }],
      issues: [],
    });
  });

  it('repara vírgula ausente entre propriedades', () => {
    expect(
      extractJson(
        '{"items":[{"type":"development" "displayName":"Aurora"}],"issues":[]}'
      )
    ).toEqual({
      items: [{ type: 'development', displayName: 'Aurora' }],
      issues: [],
    });
  });
});

describe('processamento incremental', () => {
  it('divide documentos sem perder conteúdo e respeita o limite', () => {
    const text = Array.from(
      { length: 80 },
      (_, index) => `Linha ${index}: empreendimento e condição comercial`
    ).join('\n');
    const chunks = splitDocument(text, 400);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 400)).toBe(true);
    expect(chunks.join('')).toBe(text);
  });

  it('consolida resultados e remapeia o empreendimento pai', () => {
    const base = {
      issues: [],
      usage: null,
    };
    const result = consolidateChunkAnalyses([
      {
        ...base,
        items: [
          {
            type: 'development',
            action: 'create',
            displayName: 'Aurora',
            confidence: 0.9,
            parentIndex: null,
            fields: [
              {
                name: 'name',
                value: 'Aurora',
                confidence: 0.9,
              },
            ],
          },
        ],
      },
      {
        ...base,
        items: [
          {
            type: 'development',
            action: 'create',
            displayName: 'Horizonte',
            confidence: 0.9,
            parentIndex: null,
            fields: [
              {
                name: 'name',
                value: 'Horizonte',
                confidence: 0.9,
              },
            ],
          },
          {
            type: 'offer',
            action: 'create',
            displayName: 'Studio 30 m²',
            confidence: 0.8,
            parentIndex: 0,
            fields: [
              {
                name: 'area_min_sqm',
                value: 30,
                confidence: 0.8,
              },
            ],
          },
        ],
      },
    ]);
    const horizonteIndex = result.items.findIndex(
      (item) => item.displayName === 'Horizonte'
    );
    const offer = result.items.find(
      (item) => item.displayName === 'Studio 30 m2'
    );
    expect(offer?.parentIndex).toBe(horizonteIndex);
  });
});
