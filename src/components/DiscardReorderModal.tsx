import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, GameDoc, PrivatePlayerDoc } from '../lib/types'
import { buildDeck } from '../lib/deck'

interface DiscardReorderModalProps {
  open: boolean
  game: GameDoc
  allPlayerHands: Record<string, PrivatePlayerDoc>
  drawPileCards: Card[]
  onApply: (card: Card) => Promise<void>
  onClose: () => void
}

/**
 * Dev-only modal: shows all "virtual" discarded cards (deck minus draw pile, hands, drawn cards, discardTop).
 * Allows the owner to pick any discarded card to become the new discardTop.
 */
export default function DiscardReorderModal({
  open,
  game,
  allPlayerHands,
  drawPileCards,
  onApply,
  onClose,
}: DiscardReorderModalProps) {
  const [selected, setSelected] = useState<Card | null>(null)
  const [applying, setApplying] = useState(false)

  // Compute virtual discard pile: full deck minus accounted cards
  const discardedCards = useMemo(() => {
    if (!game) return []

    const jokerCount = game.settings?.jokerCount ?? 2
    const deckSize = game.settings?.deckSize ?? 1
    const fullDeck = buildDeck(jokerCount, deckSize, game.seed)

    // Collect all accounted card IDs
    const accounted = new Set<string>()

    // Draw pile
    drawPileCards.forEach((c) => accounted.add(c.id))

    // All player hands + drawn cards
    Object.values(allPlayerHands).forEach((priv) => {
      priv.hand.forEach((c) => { if (c) accounted.add(c.id) })
      if (priv.drawnCard) accounted.add(priv.drawnCard.id)
    })

    // Current discard top
    if (game.discardTop) accounted.add(game.discardTop.id)

    // Remaining = discarded / lost cards
    return fullDeck.filter((c) => !accounted.has(c.id))
  }, [game, allPlayerHands, drawPileCards])

  const handleApply = useCallback(async () => {
    if (!selected) return
    setApplying(true)
    try {
      await onApply(selected)
      setSelected(null)
      onClose()
    } catch (e) {
      console.error('Failed to set discard top:', e)
    } finally {
      setApplying(false)
    }
  }, [selected, onApply, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
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
                  <h3 className="text-sm font-bold text-amber-300">Discard Pile Reorder</h3>
                </div>
                <button
                  onClick={onClose}
                  className="text-slate-400 hover:text-slate-200 text-lg leading-none cursor-pointer"
                >
                  ×
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Pick a card from the virtual discard pile to place on top.
              </p>
            </div>

            {/* Current discard top */}
            <div className="px-4 py-3 border-b border-slate-700/50">
              <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wider font-semibold">
                Current Discard Top
              </p>
              {game.discardTop ? (
                <div className="flex items-center gap-3">
                  <CardView card={game.discardTop} faceUp size="sm" />
                  <span className="text-xs text-slate-300">
                    {game.discardTop.isJoker ? 'Joker' : `${game.discardTop.rank} of ${game.discardTop.suit}`}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-500 italic">Empty</span>
              )}
            </div>

            {/* Discarded cards list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">
                Discarded Cards ({discardedCards.length})
              </p>
              {discardedCards.length === 0 ? (
                <p className="text-xs text-slate-500 italic text-center py-4">
                  No discarded cards found.
                </p>
              ) : (
                discardedCards.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => setSelected(selected?.id === card.id ? null : card)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all cursor-pointer ${
                      selected?.id === card.id
                        ? 'bg-amber-600/20 border border-amber-500/40 ring-1 ring-amber-500/30'
                        : 'bg-slate-900/40 border border-transparent hover:bg-slate-700/40'
                    }`}
                  >
                    <CardView card={card} faceUp size="sm" />
                    <span className="text-xs text-slate-300 flex-1 text-left">
                      {card.isJoker ? 'Joker' : `${card.rank} of ${card.suit}`}
                    </span>
                    {selected?.id === card.id && (
                      <span className="text-[9px] px-2 py-0.5 bg-amber-500/30 text-amber-300 rounded-full font-bold">
                        SELECTED
                      </span>
                    )}
                  </button>
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
                disabled={!selected || applying}
                className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
              >
                {applying ? 'Applying...' : 'Set as Top'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
