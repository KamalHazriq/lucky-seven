import { forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card } from '../lib/types'

interface StagingSlotProps {
  /** Card currently in staging (null = empty) */
  card: Card | null
  /** Whether the card is face-up (discard takes) or face-down (pile draws) */
  faceUp: boolean
  /** Whether a card is currently staged */
  active: boolean
}

/**
 * StagingSlot — the "In play" card between Draw and Discard piles.
 * Shows a card with a gentle floating animation when active.
 * Purely visual — no game state changes, no Firestore writes.
 *
 * v1.5: Gentler float, subtle drop shadow, smoother entry.
 */
const StagingSlot = forwardRef<HTMLDivElement, StagingSlotProps>(
  function StagingSlot({ card, faceUp, active }, ref) {
    return (
      <div ref={ref} className="text-center relative" style={{ minWidth: '64px' }}>
        <p className="text-[10px] text-slate-500 mb-1">In play</p>
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key="staged-card"
              initial={{ opacity: 0, scale: 0.85, y: 6 }}
              animate={{
                opacity: 1,
                scale: 1,
                y: [0, -2.5, 0],
              }}
              exit={{ opacity: 0, scale: 0.85, y: -6 }}
              transition={{
                opacity: { duration: 0.3 },
                scale: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
                y: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
              }}
              style={{
                filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
              }}
            >
              <CardView
                card={faceUp ? card : undefined}
                faceUp={faceUp}
                size="md"
              />
            </motion.div>
          ) : (
            <motion.div
              key="empty-slot"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-20 h-28 rounded-xl border-2 border-dashed border-slate-700/30 flex items-center justify-center"
            >
              <span className="text-slate-700 text-[10px]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  },
)

export default StagingSlot
