import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'

/** Convert hex/rgba color string to rgba with custom alpha */
function hexToRgba(color: string, alpha: number): string {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${alpha})`
  }
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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
 * Default duration: 1.0s (smoother feel).
 */
export default function FlyingCard({
  from,
  to,
  faceUp,
  card,
  ownerColor,
  onComplete,
  duration = 1.0,
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
        scale: [1, 1.08, 1.14, 1.12, 1.08, 1.04, 1, 1, 1],
        opacity: [1, 1, 1, 1, 1, 1, 1, 0.95, 0.85],
      }}
      transition={{ duration, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={onComplete}
      className="pointer-events-none"
      style={{ filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))' }}
    >
      <div
        className={`w-full h-full rounded-xl shadow-xl flex items-center justify-center ${
          faceUp && card
            ? 'bg-white border border-slate-200'
            : `border-2 ${ownerColor ? '' : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border-blue-700'}`
        }`}
        style={{
          ...(!faceUp && ownerColor ? {
            borderColor: ownerColor,
            background: `linear-gradient(135deg, ${hexToRgba(ownerColor, 0.7)} 0%, ${hexToRgba(ownerColor, 0.45)} 50%, ${hexToRgba(ownerColor, 0.6)} 100%)`,
          } : {}),
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
            style={{ borderColor: ownerColor ? 'rgba(255,255,255,0.35)' : 'rgba(96,165,250,0.3)' }}
          >
            <span
              className="font-bold text-sm"
              style={{ color: ownerColor ? 'rgba(255,255,255,0.6)' : 'rgba(96,165,250,0.5)' }}
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
