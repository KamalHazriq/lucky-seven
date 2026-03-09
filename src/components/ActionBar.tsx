import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PowerEffectType, PowerRankKey, PowerAssignments, DrawnCardSource } from '../lib/types'
import { getCardRankKey, EFFECT_LABELS, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'

interface ActionBarProps {
  card: Card | null
  visible: boolean
  locks: [boolean, boolean, boolean]
  powerAssignments: PowerAssignments
  spentPowerCardIds: Record<string, boolean>
  drawnCardSource: DrawnCardSource
  onSwap: (slotIndex: number) => void
  onDiscard: () => void
  onUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  /** Cancel draw — only for discard source */
  onClose: () => void
}

/**
 * Inline "Action Bar" — a horizontal strip shown below the local player hand
 * when they have a drawn card. Replaces the modal for a smoother feel.
 * Shows: drawn card preview, swap buttons, discard, power button.
 */
export default function ActionBar({
  card,
  visible,
  locks,
  powerAssignments,
  spentPowerCardIds,
  drawnCardSource,
  onSwap,
  onDiscard,
  onUsePower,
  onClose,
}: ActionBarProps) {
  const rankKey = card ? getCardRankKey(card) : null
  const effectType = rankKey ? (powerAssignments ?? DEFAULT_POWER_ASSIGNMENTS)[rankKey] : null
  const effectInfo = effectType ? EFFECT_LABELS[effectType] : null
  const rankLabel = rankKey === 'JOKER' ? 'Joker' : rankKey
  const isSpent = card ? !!spentPowerCardIds[card.id] : false
  const canCancel = drawnCardSource === 'discard'

  return (
    <AnimatePresence>
      {card && visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.97 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="mt-3 rounded-2xl border backdrop-blur-md p-3 shadow-xl"
          style={{
            background: 'color-mix(in srgb, var(--surface-solid) 90%, transparent)',
            borderColor: 'var(--border-solid)',
          }}
        >
          <div className="flex items-start gap-3">
            {/* Drawn card preview */}
            <div className="shrink-0 flex flex-col items-center">
              <p className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                Drew
              </p>
              <CardView card={card} faceUp size="sm" />
            </div>

            {/* Action buttons */}
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              {/* Swap row */}
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    onClick={() => onSwap(i)}
                    disabled={locks[i]}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      locks[i]
                        ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed opacity-50'
                        : 'bg-indigo-600/80 hover:bg-indigo-500 text-white'
                    }`}
                  >
                    {locks[i] ? '\u{1F512}' : '\u{2194}'} #{i + 1}
                  </button>
                ))}
              </div>

              {/* Discard + Power row */}
              <div className="flex gap-1.5">
                <button
                  onClick={onDiscard}
                  className="flex-1 py-1.5 bg-slate-600/70 hover:bg-slate-500/70 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Discard
                </button>

                {effectInfo && rankKey && effectType && (
                  <button
                    onClick={() => !isSpent && onUsePower(rankKey, effectType)}
                    disabled={isSpent}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors text-white ${
                      isSpent
                        ? 'bg-slate-700/50 opacity-50 cursor-not-allowed'
                        : `${effectInfo.color} cursor-pointer`
                    }`}
                  >
                    {isSpent ? `${rankLabel} (spent)` : `${rankLabel}: ${effectInfo.label}`}
                  </button>
                )}
              </div>

              {/* Cancel row (discard source only) */}
              {canCancel && (
                <button
                  onClick={onClose}
                  className="w-full py-1 bg-rose-900/25 hover:bg-rose-900/40 border border-rose-700/30 text-rose-300 rounded-lg text-[10px] font-medium transition-colors cursor-pointer"
                >
                  Cancel Take
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
