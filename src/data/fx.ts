import fxSeed from '../../data/fx-usd-sgd.json'

export interface FxRate {
  asOf: string
  rate: number
  eurUsd: number
  eurSgd: number
  source: string
  sourceName: string
  sourceUrl: string
}

export const FX_USD_SGD: FxRate = {
  asOf: fxSeed.asOf,
  rate: fxSeed.rate,
  eurUsd: fxSeed.eurUsd,
  eurSgd: fxSeed.eurSgd,
  source: fxSeed.source,
  sourceName: fxSeed.sourceName,
  sourceUrl: fxSeed.sourceUrl,
}
