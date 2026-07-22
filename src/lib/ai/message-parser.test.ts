import { afterEach, describe, expect, it, vi } from 'vitest'

import { aiMessageDelayMs, splitAiMessage } from './message-parser'

describe('splitAiMessage', () => {
  it('splits sentences, questions and paragraphs into separate bubbles', () => {
    expect(
      splitAiMessage(
        'Olá! Encontrei duas opções.\nQual bairro você prefere? Posso ajudar.',
      ),
    ).toEqual([
      'Olá!',
      'Encontrei duas opções.',
      'Qual bairro você prefere?',
      'Posso ajudar.',
    ])
  })

  it('preserves currency, decimals, URLs and common abbreviations', () => {
    expect(
      splitAiMessage(
        'O studio custa R$ 450.000,00 e tem 32,5 m². Fica na Av. Paulista. Veja https://studiosp.vercel.app/imovel/1.',
      ),
    ).toEqual([
      'O studio custa R$ 450.000,00 e tem 32,5 m².',
      'Fica na Av. Paulista.',
      'Veja https://studiosp.vercel.app/imovel/1.',
    ])
  })

  it('limits excessive fragmentation', () => {
    const parts = splitAiMessage(
      Array.from({ length: 12 }, (_, index) => `Frase ${index + 1}.`).join(' '),
    )
    expect(parts).toHaveLength(8)
    expect(parts.at(-1)).toContain('Frase 12.')
  })
})

describe('aiMessageDelayMs', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses a humanized default and caps custom values', () => {
    expect(aiMessageDelayMs()).toBe(650)
    vi.stubEnv('AI_MESSAGE_DELAY_MS', '5000')
    expect(aiMessageDelayMs()).toBe(2000)
  })
})
