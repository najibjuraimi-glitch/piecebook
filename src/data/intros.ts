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
  /** Japanese title of the JP booster (e.g. 新たなる皇帝), from Bandai's JP product page. */
  jpName: string | null
  /** Bandai's EN "card types" count as printed, e.g. "126+1". */
  cardTypes: string | null
  packsPerBox: number | null
  cardsPerPack: number | null
  /**
   * The set's story (7.1): one sentence of ours, at most 22 words, written from
   * Bandai's EN product page and never quoted; `introSource` is that page. The
   * refresh never writes it, so a new set has none until someone does.
   */
  introTheme: string | null
  introSource: string | null
  sources: string[]
  asOf: string | null
}

type Row = Partial<Record<keyof (typeof introSeed)[number] | 'jpName' | 'cardTypes' | 'introSource', unknown>> & { setCode: string }

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
    jpName: text(row.jpName),
    cardTypes: text(row.cardTypes),
    packsPerBox: count(row.packsPerBox),
    cardsPerPack: count(row.cardsPerPack),
    introTheme: text(row.introTheme),
    introSource: text(row.introSource),
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
    intro.introTheme ||
      intro.enReleased ||
      intro.jpReleased ||
      intro.cardTypes ||
      intro.packsPerBox ||
      intro.cardsPerPack,
  )
}
