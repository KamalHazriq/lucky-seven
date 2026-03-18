import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card } from '../lib/types'

interface PeekAllModalProps {
  open: boolean
  /** Map of slotIndex -> revealed card (locked slots are omitted) */
  revealedCards: Record<number, Card>
  locks: boolean[]
  onClose: () => void
}

export default function PeekAllModal({
  open,
  revealedCards,
  locks,
  onClose,
}: PeekAllModalProps) {
  // Derive slot count from locks array (supports 3 or 4 cards)
  const slotCount = locks.length || 3

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.88, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.90, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 26, mass: 0.65 }}
            className="bg-slate-800 border border-amber-500/50 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center"
          >
            <motion.h3
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06, duration: 0.2 }}
              className="text-lg font-semibold text-amber-300 mb-2"
            >
              Peek: All Your Cards!
            </motion.h3>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.2 }}
              className="text-sm text-slate-400 mb-5"
            >
              Only you can see these. Remember them!
            </motion.p>

            <div className="flex gap-3 justify-center mb-6">
              {Array.from({ length: slotCount }, (_, i) => {
                const card = revealedCards[i]
                const isLocked = locks[i]
                const delay = 0.12 + i * 0.1

                if (isLocked) {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 14, scale: 0.85 }}
                      animate={{ opacity: 0.6, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 280, damping: 22, delay }}
                      className="w-20 h-28 rounded-xl bg-slate-700/50 border-2 border-red-700/50 flex flex-col items-center justify-center"
                    >
                      <span className="text-lg">🔒</span>
                      <span className="text-[10px] text-red-400 mt-1">Locked</span>
                      <span className="text-[9px] text-slate-500">Can't peek</span>
                    </motion.div>
                  )
                }

                if (card) {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 18, scale: 0.82, rotateY: -12 }}
                      animate={{ opacity: 1, y: 0, scale: 1, rotateY: 0 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 20, delay }}
                      className="flex flex-col items-center gap-1"
                      style={{ perspective: '600px' }}
                    >
                      <CardView card={card} faceUp size="md" />
                      <span className="text-[10px] text-amber-300/70">#{i + 1}</span>
                    </motion.div>
                  )
                }

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 14, scale: 0.85 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 22, delay }}
                    className="w-20 h-28 rounded-xl bg-slate-700/50 border-2 border-slate-600 flex items-center justify-center"
                  >
                    <span className="text-slate-500 text-xs">#{i + 1}</span>
                  </motion.div>
                )
              })}
            </div>

            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + slotCount * 0.1 + 0.06 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={onClose}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors cursor-pointer"
            >
              Got it!
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
