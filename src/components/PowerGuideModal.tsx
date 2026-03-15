import { motion, AnimatePresence } from 'framer-motion'
import type { PowerAssignments, PowerRankKey, PowerEffectType } from '../lib/types'

interface PowerGuideModalProps {
  open: boolean
  onClose: () => void
  powerAssignments: PowerAssignments
}

const RANK_LABELS: Record<PowerRankKey, string> = {
  '10': '10',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
  JOKER: 'Joker',
}

const RANK_COLORS: Record<PowerRankKey, string> = {
  '10': '#06b6d4',
  J: '#fbbf24',
  Q: '#a855f7',
  K: '#ef4444',
  JOKER: '#d946ef',
}

const EFFECT_FRIENDLY: Record<PowerEffectType, string> = {
  peek_one_of_your_cards: 'Peek 1 of your cards',
  peek_all_three_of_your_cards: 'Peek all 3 cards (locked hidden)',
  swap_one_to_one: 'Swap 1:1 cards between any players',
  lock_one_card: 'Lock 1 card (prevents swapping)',
  unlock_one_locked_card: 'Unlock 1 locked card',
  rearrange_cards: 'Rearrange opponent\'s cards randomly',
  peek_one_opponent_card: 'Peek 1 opponent card',
}

const RANK_ORDER: PowerRankKey[] = ['10', 'J', 'Q', 'K', 'JOKER']

export default function PowerGuideModal({ open, onClose, powerAssignments }: PowerGuideModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
            className="bg-slate-800 border border-slate-600 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-amber-300">Power Guide</h3>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-sm"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-3">
              Draw a power card to use its ability (instead of swapping).
            </p>

            <div className="space-y-2">
              {RANK_ORDER.map((rankKey) => {
                const effect = powerAssignments[rankKey]
                return (
                  <div
                    key={rankKey}
                    className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-2.5"
                  >
                    <span
                      className="text-sm font-bold w-12 text-center shrink-0"
                      style={{ color: RANK_COLORS[rankKey] }}
                    >
                      {RANK_LABELS[rankKey]}
                    </span>
                    <span className="text-xs text-slate-300 leading-snug">
                      {EFFECT_FRIENDLY[effect]}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 p-2 bg-slate-900/40 rounded-lg">
              <p className="text-[10px] text-amber-400/80 font-medium">
                Powers are consumed on use — the card is discarded after activating.
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
