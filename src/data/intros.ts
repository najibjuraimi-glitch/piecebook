import introSeed from '../../data/set-intros.json'

/**
 * One row of Cards' `data/set-intros.json`: a one-line theme plus release
 * dates and pack structure for a set. Every field except `setCode` may be
 * missing; the UI omits what it does not have and never fills a gap itself.
 */
export interface SetIntro {
  setCode: string
  setName: string | null
  language: string | null
  /** ISO dates YYYY-MM-DD */
  enReleased: string | null
  jpReleased: string | null
  packsPerBox: number | null
  cardsPerPack: number | null
  introTheme: string | null
  sources: string[]
  asOf: string | null
}

type Row = Partial<(typeof introSeed)[number]> & { setCode: string }

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

function count(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function toIntro(row: Row): SetIntro {
  return {
    setCode: row.setCode,
    setName: text(row.setName),
    language: text(row.language),
    enReleased: text(row.enReleased),
    jpReleased: text(row.jpReleased),
    packsPerBox: count(row.packsPerBox),
    cardsPerPack: count(row.cardsPerPack),
    introTheme: text(row.introTheme),
    sources: Array.isArray(row.sources) ? row.sources.filter((s): s is string => typeof s === 'string') : [],
    asOf: text(row.asOf),
  }
}

const INTROS: SetIntro[] = (introSeed as Row[]).filter((r) => typeof r.setCode === 'string').map(toIntro)

export function getSetIntro(setCode: string, language = 'EN'): SetIntro | undefined {
  return (
    INTROS.find((i) => i.setCode === setCode && i.language === language) ??
    INTROS.find((i) => i.setCode === setCode)
  )
}

/** True when the intro has at least one line worth rendering. */
export function hasIntroContent(intro: SetIntro | undefined): intro is SetIntro {
  if (!intro) return false
  return Boolean(
    intro.introTheme || intro.enReleased || intro.jpReleased || intro.packsPerBox || intro.cardsPerPack,
  )
}
