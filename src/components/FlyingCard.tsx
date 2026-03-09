import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'

interface FlyingCardProps {
  from: DOMRect
  to: DOMRect
  faceUp: boolean
  card?: Card | null
  ownerColor?: string
  onComplete: () => void
  duration?: number
}

/**
 * Renders an animated card that flies from one position to another
 * along a curved arc path. Renders via portal into document.body.
 */
export default function FlyingCard({
  from,
  to,
  faceUp,
  card,
  ownerColor,
  onComplete,
  duration = 0.5,
}: FlyingCardProps) {
  const width = 56  // sm card width
  const height = 80 // sm card height

  // Compute start/end centers
  const sx = from.x + from.width / 2 - width / 2
  const sy = from.y + from.height / 2 - height / 2
  const ex = to.x + to.width / 2 - width / 2
  const ey = to.y + to.height / 2 - height / 2

  // Midpoint with upward arc offset
  const mx = (sx + ex) / 2
  const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
  const arcHeight = Math.min(dist * 0.35, 80)
  const my = Math.min(sy, ey) - arcHeight

  // Generate keyframe positions along quadratic bezier
  const keyframes = useMemo(() => {
    const steps = 8
    const lefts: number[] = []
    const tops: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Quadratic bezier: B(t) = (1-t)²P0 + 2(1-t)tP1 + t²P2
      const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t ** 2 * ex
      const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t ** 2 * ey
      lefts.push(x)
      tops.push(y)
    }
    return { lefts, tops }
  }, [sx, sy, mx, my, ex, ey])

  return createPortal(
    <motion.div
      initial={{
        position: 'fixed',
        left: sx,
        top: sy,
        width,
        height,
        opacity: 1,
        scale: 1,
        zIndex: 9999,
      }}
      animate={{
        left: keyframes.lefts,
        top: keyframes.tops,
        scale: [1, 1.15, 1.25, 1.2, 1.1, 1.05, 1, 1, 1],
        opacity: [1, 1, 1, 1, 1, 1, 1, 0.9, 0.8],
      }}
      transition={{ duration, ease: 'easeInOut' }}
      onAnimationComplete={onComplete}
      className="pointer-events-none"
      style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' }}
    >
      <div
        className={`w-full h-full rounded-xl shadow-xl flex items-center justify-center ${
          faceUp && card
            ? 'bg-white border border-slate-200'
            : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border-2'
        }`}
        style={{
          ...(!faceUp && ownerColor ? { borderColor: ownerColor } : {}),
          ...(!faceUp && !ownerColor ? { borderColor: 'rgb(29,78,216)' } : {}),
        }}
      >
        {faceUp && card ? (
          <span
            className="font-bold text-xs"
            style={{ color: suitColor(card) }}
          >
            {cardDisplay(card)}
          </span>
        ) : (
          <div
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
            style={{ borderColor: ownerColor ?? 'rgba(96,165,250,0.3)' }}
          >
            <span
              className="font-bold text-sm"
              style={{ color: ownerColor ?? 'rgba(96,165,250,0.5)' }}
            >
              7
            </span>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}
