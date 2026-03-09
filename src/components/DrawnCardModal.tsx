import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PowerEffectType, PowerRankKey, PowerAssignments, DrawnCardSource } from '../lib/types'
import { getCardRankKey, EFFECT_LABELS, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'

interface DrawnCardModalProps {
  card: Card | null
  open: boolean
  locks: [boolean, boolean, boolean]
  powerAssignments: PowerAssignments
  spentPowerCardIds: Record<string, boolean>
  /** Player's known cards map (slot index string → Card) */
  knownCards: Record<string, Card>
  /** Where the drawn card came from — hides close button for pile draws */
  drawnCardSource: DrawnCardSource
  onSwap: (slotIndex: number) => void
  onDiscard: () => void
  onUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  onClose: () => void
}

export default function DrawnCardModal({
  card,
  open,
  locks,
  powerAssignments,
  spentPowerCardIds,
  knownCards,
  drawnCardSource,
  onSwap,
  onDiscard,
  onUsePower,
  onClose,
}: DrawnCardModalProps) {
  const rankKey = card ? getCardRankKey(card) : null
  const effectType = rankKey ? (powerAssignments ?? DEFAULT_POWER_ASSIGNMENTS)[rankKey] : null
  const effectInfo = effectType ? EFFECT_LABELS[effectType] : null
  const rankLabel = rankKey === 'JOKER' ? 'Joker' : rankKey
  const isSpent = card ? !!spentPowerCardIds[card.id] : false
  const canCancel = drawnCardSource === 'discard'

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && canCancel) onClose()
  }, [onClose, canCancel])

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, handleKeyDown])

  return (
    <AnimatePresence>
      {card && open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={canCancel ? onClose : undefined}
        >
          <motion.div
            initial={{ scale: 0.8, y: 40 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 40 }}
            className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-sm w-full shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button — only for discard-sourced draws (pile draws cannot be undone) */}
            {canCancel && (
              <button
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-sm"
                aria-label="Cancel draw (choose again)"
                title="Cancel draw (choose again)"
              >
                &times;
              </button>
            )}

            <h3 className="text-center text-lg font-semibold text-slate-200 mb-4">
              You drew:
            </h3>

            <div className="flex justify-center mb-4">
              <CardView card={card} faceUp size="lg" />
            </div>

            {/* Your hand — compact row showing known/unknown cards */}
            <div className="mb-4">
              <p className="text-[11px] text-slate-400 text-center mb-2 font-medium uppercase tracking-wide">
                Your cards
              </p>
              <div className="flex gap-2 justify-center">
                {[0, 1, 2].map((i) => {
                  const known = knownCards[String(i)]
                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <CardView
                        card={known ?? undefined}
                        faceUp={!!known}
                        locked={locks[i]}
                        size="sm"
                      />
                      <span className="text-[10px] text-slate-500 font-medium">#{i + 1}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-slate-400 text-center mb-3">
                Swap with one of your cards, discard{effectInfo ? ', or use its power.' : '.'}
              </p>

              <div className="flex gap-2 justify-center mb-3">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    onClick={() => onSwap(i)}
                    disabled={locks[i]}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      locks[i]
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {locks[i] ? '\u{1F512}' : ''} Swap #{i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={onDiscard}
                className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Discard
              </button>

              {effectInfo && rankKey && effectType && (
                <button
                  onClick={() => !isSpent && onUsePower(rankKey, effectType)}
                  disabled={isSpent}
                  className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors mt-1 text-white ${
                    isSpent
                      ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                      : `${effectInfo.color} cursor-pointer`
                  }`}
                >
                  <span className="font-semibold">{rankLabel}: {effectInfo.label}</span>
                  {isSpent && (
                    <span className="inline-block ml-1.5 px-1.5 py-0.5 bg-slate-600/80 text-slate-400 text-[9px] font-bold rounded align-middle">
                      SPENT
                    </span>
                  )}
                  <span className="block text-xs opacity-80 mt-0.5">
                    {isSpent ? 'Power already used for this card.' : effectInfo.desc}
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
