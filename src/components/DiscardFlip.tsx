import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'

interface DiscardFlipProps {
  /** Current discard top card */
  discardTop: Card | null
  /** Whether reduced motion is active */
  reduced: boolean
}

/**
 * DiscardFlip — 3D flip animation when a new card becomes the discard top.
 * Detects discardTop id change and plays a flip-in.
 * Overlays the discard pile card briefly then fades out.
 * Section 5 of v1.4.2.
 */
export default function DiscardFlip({ discardTop, reduced }: DiscardFlipProps) {
  const prevIdRef = useRef<string | null>(null)
  const [flipCard, setFlipCard] = useState<Card | null>(null)
  const [showFlip, setShowFlip] = useState(false)

  useEffect(() => {
    const newId = discardTop?.id ?? null
    const oldId = prevIdRef.current

    if (newId && newId !== oldId && oldId !== null) {
      // New discard top appeared — trigger flip
      setFlipCard(discardTop)
      setShowFlip(true)
      const timer = setTimeout(() => {
        setShowFlip(false)
      }, reduced ? 300 : 900)
      return () => clearTimeout(timer)
    }

    prevIdRef.current = newId
  }, [discardTop, reduced])

  // Update prevId when discardTop changes even without animation
  useEffect(() => {
    prevIdRef.current = discardTop?.id ?? null
  }, [discardTop?.id])

  if (reduced) {
    return (
      <AnimatePresence>
        {showFlip && flipCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          >
            <div className="w-full h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-lg">
              <span className="font-bold text-sm" style={{ color: suitColor(flipCard) }}>
                {cardDisplay(flipCard)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence>
      {showFlip && flipCard && (
        <motion.div
          initial={{ rotateY: 180, scale: 0.9 }}
          animate={{ rotateY: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{
            rotateY: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            scale: { duration: 0.4, ease: 'easeOut' },
          }}
          className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
          style={{ perspective: '600px', backfaceVisibility: 'hidden' }}
        >
          <div className="w-full h-full rounded-xl bg-white border border-slate-200 flex items-center justify-center shadow-xl">
            <span className="font-bold text-sm" style={{ color: suitColor(flipCard) }}>
              {cardDisplay(flipCard)}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
