import feesSeed from '../../data/psa-fees.json'

export type PsaFeeTierId = 'standard' | 'priority' | 'express'

export interface PsaFeeTier {
  id: PsaFeeTierId
  name: string
  feeUsd: number
  declaredMaxUsd: number
}

export interface PsaFeeConfig {
  asOf: string
  sourceName: string
  sourceUrl: string
  note: string
  currency: 'USD'
  tiers: PsaFeeTier[]
  priorityBumpOverUsd: number
  turnaroundMonths: { min: number; max: number }
}

export const PSA_FEES: PsaFeeConfig = {
  asOf: feesSeed.asOf,
  sourceName: feesSeed.sourceName,
  sourceUrl: feesSeed.sourceUrl,
  note: feesSeed.note,
  currency: 'USD',
  tiers: feesSeed.tiers.map((t) => ({
    id: t.id as PsaFeeTierId,
    name: t.name,
    feeUsd: t.feeUsd,
    declaredMaxUsd: t.declaredMaxUsd,
  })),
  priorityBumpOverUsd: feesSeed.priorityBumpOverUsd,
  turnaroundMonths: feesSeed.turnaroundMonths,
}

export function tierById(id: PsaFeeTierId, fees: PsaFeeConfig = PSA_FEES): PsaFeeTier {
  const found = fees.tiers.find((t) => t.id === id)
  if (!found) throw new Error(`Unknown PSA fee tier: ${id}`)
  return found
}
