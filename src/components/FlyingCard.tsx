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
 * Renders an animated card that flies from one position to another.
 * Renders via a portal into document.body for correct positioning.
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

  return createPortal(
    <motion.div
      initial={{
        position: 'fixed',
        left: from.x + from.width / 2 - width / 2,
        top: from.y + from.height / 2 - height / 2,
        width,
        height,
        opacity: 1,
        scale: 1,
        zIndex: 9999,
      }}
      animate={{
        left: to.x + to.width / 2 - width / 2,
        top: to.y + to.height / 2 - height / 2,
        scale: [1, 1.2, 1],
        opacity: [1, 1, 0.8],
      }}
      transition={{ duration, ease: 'easeInOut' }}
      onAnimationComplete={onComplete}
      className="pointer-events-none"
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
