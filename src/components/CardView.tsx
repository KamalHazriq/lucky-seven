import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { Card, LockInfo } from '../lib/types'
import { cardDisplay, suitColor } from '../lib/deck'

interface CardViewProps {
  card?: Card | null
  faceUp?: boolean
  known?: boolean
  locked?: boolean
  lockInfo?: LockInfo | null
  onClick?: () => void
  disabled?: boolean
  highlight?: boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

const sizes = {
  sm: 'w-14 h-20 text-xs',
  md: 'w-20 h-28 text-sm',
  lg: 'w-24 h-34 text-base',
}

export default function CardView({
  card,
  faceUp = false,
  known = false,
  locked = false,
  lockInfo,
  onClick,
  disabled = false,
  highlight = false,
  size = 'md',
  label,
}: CardViewProps) {
  const showFace = faceUp && card
  const [showTooltip, setShowTooltip] = useState(false)
  const lockerName = lockInfo?.lockerName
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Mobile: long-press to show tooltip
  const handleTouchStart = useCallback(() => {
    if (!lockerName) return
    longPressRef.current = setTimeout(() => setShowTooltip(true), 400)
  }, [lockerName])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  // Close tooltip on outside tap
  useEffect(() => {
    if (!showTooltip) return
    const handler = (e: TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false)
      }
    }
    document.addEventListener('touchstart', handler, { passive: true })
    return () => document.removeEventListener('touchstart', handler)
  }, [showTooltip])

  return (
    <motion.div
      whileHover={onClick && !disabled ? { scale: 1.08, y: -4 } : undefined}
      whileTap={onClick && !disabled ? { scale: 0.95 } : undefined}
      onClick={!disabled ? onClick : undefined}
      className={`
        ${sizes[size]}
        relative rounded-xl select-none
        flex flex-col items-center justify-center
        shadow-lg transition-shadow duration-200
        ${onClick && !disabled ? 'cursor-pointer' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${highlight ? 'ring-2 ring-gold ring-offset-2 ring-offset-transparent shadow-gold/30 shadow-xl' : ''}
        ${showFace
          ? 'bg-white border border-slate-200'
          : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border border-blue-700'
        }
      `}
      style={{ perspective: '600px' }}
    >
      {showFace ? (
        <motion.div
          initial={{ rotateY: 90 }}
          animate={{ rotateY: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="flex flex-col items-center justify-center"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <span
            className="font-bold leading-tight"
            style={{ color: suitColor(card) }}
          >
            {cardDisplay(card)}
          </span>
          {card.rank === '7' && !card.isJoker && (
            <span className="absolute -top-1 -right-1 bg-amber-400 text-amber-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              0
            </span>
          )}
        </motion.div>
      ) : (
        <div className="card-shimmer absolute inset-0 rounded-xl">
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 rounded-full border-2 border-blue-400/30 flex items-center justify-center">
              <span className="text-blue-400/50 font-bold text-lg">7</span>
            </div>
          </div>
        </div>
      )}

      {/* King lock overlay — visible on locked cards */}
      {locked && (
        <div className="absolute inset-0 rounded-xl bg-red-900/20 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none">
          <div className="flex flex-col items-center">
            <span className="text-2xl drop-shadow-lg">K</span>
            <span
              className="text-red-400 text-lg drop-shadow-lg"
              style={{ lineHeight: 1 }}
            >
              🔒
            </span>
          </div>
        </div>
      )}

      {/* Lock tooltip trigger — hover + long-press */}
      {locked && lockerName && (
        <div
          ref={tooltipRef}
          className="absolute inset-0 z-20 cursor-help"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          role="group"
          aria-describedby={showTooltip ? 'lock-tooltip' : undefined}
        >
          {showTooltip && (
            <div
              id="lock-tooltip"
              role="tooltip"
              className="absolute -top-9 left-1/2 -translate-x-1/2 bg-slate-900 border border-red-500/50 text-red-300 text-[10px] font-medium px-2 py-1 rounded-lg shadow-lg whitespace-nowrap z-30 pointer-events-none"
            >
              Locked by {lockerName}
            </div>
          )}
        </div>
      )}

      {known && !faceUp && (
        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full z-10">
          Known
        </span>
      )}

      {label && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap">
          {label}
        </span>
      )}
    </motion.div>
  )
}
