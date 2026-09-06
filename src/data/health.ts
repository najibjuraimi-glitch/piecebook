import healthSeed from '../../data/health.json'

export interface UnpricedPrint {
  setCode: string
  cardNumber: string
  name: string
}

export interface HealthReport {
  asOf: string
  weekOf: string
  seed: {
    files: number
    rows: number
    cardPricesAsOf: string
    versionNote: string
  }
  boxFeed: {
    newest: string
    source: string
    staleAfterDays: number
  }
  wiki: {
    fetchedAt: string
    asked: number
    mapped: number
    lines: number
    births: number
  }
  unpriced: UnpricedPrint[]
  exclusions: string[]
  warnings: string[]
  errors: number
}

export const HEALTH: HealthReport = healthSeed as HealthReport
