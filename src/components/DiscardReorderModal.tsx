import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card } from '../lib/types'

interface DrawPileReorderModalProps {
  open: boolean
  drawPileCards: Card[]
  onApply: (reordered: Card[]) => Promise<void>
  onClose: () => void
}

/**
 * Dev-only modal: shows the draw pile and allows the owner to reorder cards.
 * Tap a card to move it to the top of the draw pile (position #1 = next drawn).
 * Long-press or use arrows to move cards up/down.
 */
export default function DrawPileReorderModal({
  open,
  drawPileCards,
  onApply,
  onClose,
}: DrawPileReorderModalProps) {
  const [cards, setCards] = useState<Card[]>([])
  const [applying, setApplying] = useState(false)
  const [dirty, setDirty] = useState(false)

  // Sync from props when modal opens
  const handleOpen = useCallback(() => {
    setCards([...drawPileCards])
    setDirty(false)
  }, [drawPileCards])

  const moveToTop = (index: number) => {
    if (index === 0) return
    setCards((prev) => {
      const next = [...prev]
      const [card] = next.splice(index, 1)
      next.unshift(card)
      return next
    })
    setDirty(true)
  }

  const moveUp = (index: number) => {
    if (index === 0) return
    setCards((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    setDirty(true)
  }

  const moveDown = (index: number) => {
    setCards((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    setDirty(true)
  }

  const handleApply = useCallback(async () => {
    setApplying(true)
    try {
      await onApply(cards)
      onClose()
    } catch (e) {
      console.error('Failed to reorder draw pile:', e)
    } finally {
      setApplying(false)
    }
  }, [cards, onApply, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
          onAnimationComplete={handleOpen}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="bg-slate-800 border border-amber-600/40 rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-4 py-3 bg-amber-900/20 border-b border-amber-600/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🔀</span>
                  <h3 className="text-sm font-bold text-amber-300">Draw Pile Reorder</h3>
                </div>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-200 text-lg leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Tap a card to move it to the top. Use arrows to fine-tune order. Card #1 is drawn next.
              </p>
            </div>

            {/* Cards list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                Draw Pile ({cards.length} cards)
              </p>
              {cards.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">
                  Draw pile is empty.
                </p>
              ) : (
                cards.map((card, i) => (
                  <div
                    key={card.id}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-xl transition-all ${
                      i === 0
                        ? 'bg-amber-600/15 border border-amber-500/30'
                        : 'bg-slate-900/40 border border-transparent hover:bg-slate-700/40'
                    }`}
                  >
                    {/* Position number */}
                    <span className="text-[10px] text-slate-500 w-5 text-right font-mono shrink-0">
                      {i + 1}.
                    </span>

                    {/* Card preview */}
                    <CardView card={card} faceUp size="sm" />

                    {/* Card name */}
                    <span className="text-xs text-slate-300 flex-1 text-left truncate">
                      {card.isJoker ? '🃏 Joker' : `${card.rank} of ${card.suit}`}
                    </span>

                    {/* NEXT badge for position 1 */}
                    {i === 0 && (
                      <span className="text-[8px] px-1.5 py-0.5 bg-amber-600/30 text-amber-300 rounded-full font-bold shrink-0">
                        NEXT
                      </span>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {/* Move to top */}
                      {i > 0 && (
                        <button
                          onClick={() => moveToTop(i)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-amber-900/40 hover:bg-amber-900/60 text-amber-300 text-[10px] transition-colors cursor-pointer"
                          title="Move to top"
                        >
                          ⏫
                        </button>
                      )}
                      {/* Move up */}
                      {i > 0 && (
                        <button
                          onClick={() => moveUp(i)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-300 text-[10px] transition-colors cursor-pointer"
                          title="Move up"
                        >
                          ▲
                        </button>
                      )}
                      {/* Move down */}
                      {i < cards.length - 1 && (
                        <button
                          onClick={() => moveDown(i)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-300 text-[10px] transition-colors cursor-pointer"
                          title="Move down"
                        >
                          ▼
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-slate-700/50 flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!dirty || applying}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {applying ? 'Applying...' : 'Apply Order'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
