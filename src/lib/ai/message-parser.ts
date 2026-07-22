const DEFAULT_DELAY_MS = 650
const MAX_DELAY_MS = 2_000
const MAX_MESSAGE_PARTS = 8

const NON_TERMINAL_ABBREVIATIONS = new Set([
  'sr.',
  'sra.',
  'srta.',
  'dr.',
  'dra.',
  'prof.',
  'profa.',
  'av.',
  'apto.',
  'nº.',
  'etc.',
  'ex.',
])

function endsWithNonTerminalAbbreviation(value: string): boolean {
  const lastWord = value.trim().toLocaleLowerCase('pt-BR').split(/\s+/).at(-1)
  return lastWord ? NON_TERMINAL_ABBREVIATIONS.has(lastWord) : false
}

function splitParagraph(paragraph: string): string[] {
  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'sentence' })
  const sentences = Array.from(segmenter.segment(paragraph), ({ segment }) =>
    segment.trim(),
  ).filter(Boolean)

  const merged: string[] = []
  for (const sentence of sentences) {
    const previous = merged.at(-1)
    if (previous && endsWithNonTerminalAbbreviation(previous)) {
      merged[merged.length - 1] = `${previous} ${sentence}`
      continue
    }
    merged.push(sentence)
  }

  return merged.flatMap((sentence) =>
    sentence
      .split(/;\s+/)
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

/**
 * Turns an AI answer into short WhatsApp-sized bubbles. Sentence boundaries,
 * paragraph breaks and semicolons become separate messages. Intl.Segmenter
 * keeps decimals, currency values, URLs and most abbreviations intact.
 */
export function splitAiMessage(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []

  const parts = normalized
    .split(/\n+/)
    .flatMap((paragraph) => splitParagraph(paragraph.trim()))
    .filter(Boolean)

  if (parts.length <= MAX_MESSAGE_PARTS) return parts

  return [
    ...parts.slice(0, MAX_MESSAGE_PARTS - 1),
    parts.slice(MAX_MESSAGE_PARTS - 1).join(' '),
  ]
}

export function aiMessageDelayMs(): number {
  const configured = Number(process.env.AI_MESSAGE_DELAY_MS)
  if (!Number.isFinite(configured) || configured < 0) return DEFAULT_DELAY_MS
  return Math.min(Math.floor(configured), MAX_DELAY_MS)
}

export async function waitBetweenAiMessages(): Promise<void> {
  const delay = aiMessageDelayMs()
  if (delay === 0) return
  await new Promise((resolve) => setTimeout(resolve, delay))
}
