import { useState } from 'react'
import type { Card } from '../data/seed'

interface Props {
  card: Card
  className?: string
  /** Larger type for the placeholder on the detail screen. */
  large?: boolean
  /** Prioritise loading (detail screen hero). */
  eager?: boolean
}

/**
 * Card art with a fade-in on load and a paper placeholder (set number in type)
 * when the image is missing or fails. Parallels get a thin gold ring.
 */
export function CardArt({ card, className = '', large = false, eager = false }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(!card.imageUrl)

  const ring = card.isParallel ? 'ring-1 ring-[#C9A227] ring-offset-1 ring-offset-paper' : ''

  return (
    <div
      className={`relative aspect-[5/7] w-full overflow-hidden rounded-xl bg-[#EFEBE3] ${ring} ${className}`}
    >
      {!failed && card.imageUrl && (
        <img
          src={card.imageUrl}
          alt={`${card.name} ${card.cardNumber}`}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`h-full w-full object-cover transition-opacity duration-200 ease-out ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {failed && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center">
          <span className={`tabular font-semibold text-ink ${large ? 'text-title' : 'text-[13px]'}`}>
            {card.cardNumber}
          </span>
          <span className={`text-muted ${large ? 'text-meta' : 'text-[11px] leading-[14px]'}`}>No art</span>
        </div>
      )}
    </div>
  )
}
