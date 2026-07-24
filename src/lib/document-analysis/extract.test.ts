import { describe, expect, it } from 'vitest';
import { extractDocument } from './extract';

describe('extractDocument', () => {
  it('extrai TXT localmente', async () => {
    const result = await extractDocument(
      new TextEncoder().encode('Condição comercial válida até dezembro.'),
      'text/plain'
    );
    expect(result.text).toContain('Condição comercial');
    expect(result.metadata.extraction).toBe('text-decoder');
  });

  it('bloqueia imagem antes de OCR externo', async () => {
    await expect(
      extractDocument(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47]),
        'image/png'
      )
    ).rejects.toThrow(/OCR externo não pode receber/);
  });
});
