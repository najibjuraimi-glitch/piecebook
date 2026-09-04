import { rarityLabel } from '../data/seed'

/** Soft, low-saturation tints per rarity. Parallels are marked on the art frame, not here. */
const TINTS: Record<string, string> = {
  L: 'bg-[#F1E7DA] text-[#6B4A2B]',
  SEC: 'bg-[#E9E4F0] text-[#4F3F6B]',
  SR: 'bg-[#F3ECD9] text-[#6B5A22]',
  R: 'bg-[#E3E9EF] text-[#3A4E63]',
  UC: 'bg-[#E5EDE6] text-[#3B5A44]',
  C: 'bg-[#EEEBE5] text-[#6B6560]',
  SP: 'bg-[#F2E3E0] text-[#7A3C33]',
  TR: 'bg-[#F2E3E0] text-[#7A3C33]',
}

/** On-card rarity badge. Shows the spelled label (Leader, Secret Rare, …); filter chips keep short codes via RarityTabs. */
export function RarityChip({ rarity, size = 'sm' }: { rarity: string; size?: 'sm' | 'md' }) {
  const tint = TINTS[rarity] ?? 'bg-[#EEEBE5] text-[#6B6560]'
  const dims = size === 'sm' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-[12px]'
  return (
    <span className={`inline-flex shrink-0 items-center rounded-md font-semibold leading-none tracking-wide ${tint} ${dims}`}>
      {rarityLabel(rarity)}
    </span>
  )
}
