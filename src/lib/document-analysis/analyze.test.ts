import { describe, expect, it } from 'vitest';
import { extractJson } from './analyze';

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
