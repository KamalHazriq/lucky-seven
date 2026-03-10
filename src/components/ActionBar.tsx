import { memo, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { Card, PowerEffectType, PowerRankKey, PowerAssignments, DrawnCardSource, PlayerDoc } from '../lib/types'
import { getCardRankKey, EFFECT_LABELS, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'
import type { SelectionModeState, SelectedTarget } from '../hooks/useSelectionMode'

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
  /** Selection mode state from useSelectionMode */
  selection?: SelectionModeState | null
  /** Callbacks for selection mode */
  onSelectionConfirm?: () => void
  onSelectionCancel?: () => void
  onSelectionGoBack?: () => void
  /** Whether desktop (shows keyboard hints) */
  isDesktop?: boolean
  /** Players map — for resolving display names in selection confirm */
  players?: Record<string, PlayerDoc>
  /** Whether any card is locked anywhere — used to disable unlock power */
  hasAnyLocks?: boolean
}

/**
 * Inline "Action Bar" — a horizontal strip shown below the local player hand
 * when they have a drawn card. Replaces the modal for a smoother feel.
 *
 * v1.4: Supports selection mode overlay for power flows (peek, swap, lock, etc.)
 *       Shows keyboard hints on desktop [1][2][3] and [Esc]
 */
function ActionBar({
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
  selection,
  onSelectionConfirm,
  onSelectionCancel,
  onSelectionGoBack,
  isDesktop = false,
  players,
  hasAnyLocks = true,
}: ActionBarProps) {
  const rankKey = useMemo(() => card ? getCardRankKey(card) : null, [card])
  const effectType = useMemo(() => rankKey ? (powerAssignments ?? DEFAULT_POWER_ASSIGNMENTS)[rankKey] : null, [rankKey, powerAssignments])
  const effectInfo = useMemo(() => effectType ? EFFECT_LABELS[effectType] : null, [effectType])
  const rankLabel = rankKey === 'JOKER' ? 'Joker' : rankKey
  const isSpent = card ? !!spentPowerCardIds[card.id] : false
  const isUnlockWithNoTargets = effectType === 'unlock_one_locked_card' && !hasAnyLocks
  const canCancel = drawnCardSource === 'discard'

  const isSelecting = selection && selection.phase !== 'idle'

  // Resolve target names for confirmation view
  const resolveTarget = useCallback((target: SelectedTarget | null): string => {
    if (!target || !players) return '?'
    const pd = players[target.playerId]
    return pd ? `${pd.displayName}'s #${target.slotIndex + 1}` : `#${target.slotIndex + 1}`
  }, [players])

  return (
    <AnimatePresence>
      {card && visible && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26, mass: 0.7 }}
          className="mt-3 rounded-2xl border backdrop-blur-md p-3 shadow-xl"
          style={{
            background: 'color-mix(in srgb, var(--surface-solid) 90%, transparent)',
            borderColor: 'var(--border-solid)',
          }}
        >
          <AnimatePresence mode="wait">
            {isSelecting ? (
              /* ─── Selection Mode Overlay ─────────────────────── */
              <motion.div
                key="selection"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.6 }}
              >
                {/* Prompt */}
                <p className="text-xs font-semibold text-amber-300 mb-2 text-center">
                  {selection?.phase === 'confirming' ? (
                    <>
                      {selection.constraint?.secondTargetType ? (
                        // Two-target confirm (queen swap)
                        <span>
                          Swap {resolveTarget(selection.firstTarget)} ↔ {resolveTarget(selection.secondTarget)}?
                        </span>
                      ) : (
                        // Single-target confirm
                        <span>
                          {selection.constraint?.prompt?.replace('Pick', 'Confirm')} → {resolveTarget(selection.firstTarget)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>
                      {selection?.phase === 'choosingSecondTarget'
                        ? selection.constraint?.secondPrompt
                        : selection?.constraint?.prompt}
                    </span>
                  )}
                </p>

                {/* Action buttons */}
                <div className="flex gap-1.5">
                  {selection?.phase === 'confirming' && (
                    <button
                      onClick={onSelectionConfirm}
                      className="flex-1 py-1.5 bg-emerald-600/80 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {isDesktop && <Kbd>↵</Kbd>} Confirm
                    </button>
                  )}

                  {selection?.phase === 'choosingSecondTarget' && (
                    <button
                      onClick={onSelectionGoBack}
                      className="flex-1 py-1.5 bg-slate-600/70 hover:bg-slate-500/70 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Back
                    </button>
                  )}

                  <button
                    onClick={onSelectionCancel}
                    className="flex-1 py-1.5 bg-rose-900/40 hover:bg-rose-900/60 border border-rose-700/30 text-rose-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                  >
                    {isDesktop && <Kbd>Esc</Kbd>} Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              /* ─── Normal Action Buttons ──────────────────────── */
              <motion.div
                key="actions"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.6 }}
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
                          {isDesktop && !locks[i] && <Kbd>{i + 1}</Kbd>}
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
                          onClick={() => !isSpent && !isUnlockWithNoTargets && onUsePower(rankKey, effectType)}
                          disabled={isSpent || isUnlockWithNoTargets}
                          title={isSpent ? 'Power already used for this card' : isUnlockWithNoTargets ? 'No card is locked right now' : effectInfo.desc}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors text-white ${
                            isSpent || isUnlockWithNoTargets
                              ? 'bg-slate-700/50 opacity-50 cursor-not-allowed'
                              : `${effectInfo.color} cursor-pointer`
                          }`}
                        >
                          {isSpent ? `${rankLabel} (spent)` : isUnlockWithNoTargets ? `${rankLabel}: No locks` : `${rankLabel}: ${effectInfo.label}`}
                        </button>
                      )}
                    </div>

                    {/* Cancel row (discard source only) */}
                    {canCancel && (
                      <button
                        onClick={onClose}
                        className="w-full py-1 bg-rose-900/25 hover:bg-rose-900/40 border border-rose-700/30 text-rose-300 rounded-lg text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        {isDesktop && <Kbd>Esc</Kbd>} Cancel Take
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export default memo(ActionBar)

/** Tiny keyboard hint badge */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 mr-1 bg-slate-900/60 border border-slate-600/50 rounded text-[9px] font-mono text-slate-400 align-middle leading-none">
      {children}
    </span>
  )
}
