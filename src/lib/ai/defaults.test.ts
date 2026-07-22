import { describe, expect, it } from 'vitest'

import { buildSystemPrompt } from './defaults'

describe('buildSystemPrompt Sofia identity', () => {
  it('uses a natural persona without instructing deceptive identity claims', () => {
    const prompt = buildSystemPrompt({
      userPrompt: null,
      mode: 'auto_reply',
      catalog: [],
    })

    expect(prompt).toContain('Seu nome é Sofia')
    expect(prompt).toContain('Não anuncie espontaneamente')
    expect(prompt).toContain('responda com transparência')
    expect(prompt).toContain('Nunca afirme ser humana')
    expect(prompt).toContain('credentials, tokens')
  })
})
