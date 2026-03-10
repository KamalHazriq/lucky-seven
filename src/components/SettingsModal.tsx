import { motion, AnimatePresence } from 'framer-motion'
import { isSfxEnabled, setSfxEnabled, isHapticEnabled, setHapticEnabled, isPerformanceModeEnabled, setPerformanceModeEnabled } from '../lib/sfx'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useTheme, type Theme } from '../hooks/useTheme'
import { useState, useEffect } from 'react'

const SPRING_MODAL = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  /** Current layout mode */
  layout?: 'classic' | 'table'
  onToggleLayout?: () => void
  /** Current UI mode */
  uiMode?: 'modal' | 'actionbar'
  onToggleUiMode?: () => void
  /** Log position */
  logPosition?: 'bottom' | 'left'
  onToggleLogPosition?: () => void
  /** Feature availability flags */
  showLayoutToggle?: boolean
  showUiModeToggle?: boolean
  showLogToggle?: boolean
  /** Leave game handler */
  onLeaveGame?: () => void
  /** Vote kick handler — pass player ID to initiate */
  onVoteKick?: (targetId: string) => void
  /** Other players for vote kick list */
  otherPlayers?: { id: string; name: string }[]
  /** Whether a vote is already in progress */
  voteKickActive?: boolean
}

const THEMES: { value: Theme; label: string; icon: string; desc: string }[] = [
  { value: 'blue', label: 'Ocean', icon: '\u{1F30A}', desc: 'Deep blue gradient' },
  { value: 'dark', label: 'Midnight', icon: '\u{1F311}', desc: 'True dark theme' },
  { value: 'light', label: 'Daylight', icon: '\u2600\uFE0F', desc: 'Light & bright' },
]

export default function SettingsModal({
  open,
  onClose,
  layout,
  onToggleLayout,
  uiMode,
  onToggleUiMode,
  logPosition,
  onToggleLogPosition,
  showLayoutToggle = false,
  showUiModeToggle = false,
  showLogToggle = false,
  onLeaveGame,
  onVoteKick,
  otherPlayers,
  voteKickActive = false,
}: SettingsModalProps) {
  const { theme, setTheme } = useTheme()
  const { reduced, pref, cycle } = useReducedMotion()
  const [sfx, setSfxState] = useState(isSfxEnabled)
  const [haptic, setHapticState] = useState(isHapticEnabled)
  const [perfMode, setPerfModeState] = useState(isPerformanceModeEnabled)
  const hasVibrate = typeof navigator !== 'undefined' && 'vibrate' in navigator

  useEffect(() => {
    setSfxState(isSfxEnabled())
    setHapticState(isHapticEnabled())
    setPerfModeState(isPerformanceModeEnabled())
  }, [open])

  const toggleSfx = () => {
    const next = !sfx
    setSfxEnabled(next)
    setSfxState(next)
  }

  const toggleHaptic = () => {
    const next = !haptic
    setHapticEnabled(next)
    setHapticState(next)
  }

  const togglePerfMode = () => {
    const next = !perfMode
    setPerformanceModeEnabled(next)
    setPerfModeState(next)
  }

  const motionLabel = pref === 'system' ? `System (${reduced ? 'reduced' : 'full'})` : pref === 'on' ? 'Reduced' : 'Full'

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
            transition={SPRING_MODAL}
            className="bg-slate-800 border border-slate-600 rounded-2xl p-5 max-w-sm w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{'\u2699\uFE0F'}</span>
                <h3 className="text-lg font-bold text-amber-300">Settings</h3>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-sm"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <div className="space-y-5">
              {/* ─── Theme ─── */}
              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Theme</h4>
                <div className="grid grid-cols-3 gap-2">
                  {THEMES.map((t) => (
                    <motion.button
                      key={t.value}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setTheme(t.value)}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-colors cursor-pointer ${
                        theme === t.value
                          ? 'bg-amber-600/20 border-amber-500/60 text-white'
                          : 'bg-slate-900/40 border-slate-700/40 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <span className="text-xl">{t.icon}</span>
                      <span className="text-xs font-semibold">{t.label}</span>
                    </motion.button>
                  ))}
                </div>
              </section>

              {/* ─── Audio & Haptics ─── */}
              <section>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Audio & Feedback</h4>
                <div className="space-y-2">
                  {/* SFX toggle */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={toggleSfx}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{sfx ? '\u{1F50A}' : '\u{1F507}'}</span>
                      <span className="text-sm font-medium text-slate-200">Sound Effects</span>
                    </div>
                    <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${sfx ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                      <motion.div
                        animate={{ x: sfx ? 16 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-5 h-5 rounded-full bg-white shadow-md"
                      />
                    </div>
                  </motion.button>

                  {/* Haptics toggle */}
                  {hasVibrate && (
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={toggleHaptic}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{haptic ? '\u{1F4F3}' : '\u{1F4F4}'}</span>
                        <span className="text-sm font-medium text-slate-200">Vibration</span>
                      </div>
                      <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${haptic ? 'bg-purple-500' : 'bg-slate-600'}`}>
                        <motion.div
                          animate={{ x: haptic ? 16 : 0 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                          className="w-5 h-5 rounded-full bg-white shadow-md"
                        />
                      </div>
                    </motion.button>
                  )}

                  {/* Motion toggle */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={cycle}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{reduced ? '\u{23F8}\uFE0F' : '\u{25B6}\uFE0F'}</span>
                      <div className="text-left">
                        <span className="text-sm font-medium text-slate-200 block">Motion</span>
                        <span className="text-[10px] text-slate-500">{motionLabel}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 px-2 py-1 rounded-lg">
                      Tap to cycle
                    </span>
                  </motion.button>

                  {/* Performance mode toggle */}
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={togglePerfMode}
                    className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{perfMode ? '\u26A1' : '\u2728'}</span>
                      <div className="text-left">
                        <span className="text-sm font-medium text-slate-200 block">Performance Mode</span>
                        <span className="text-[10px] text-slate-500">Disables shimmer, glow & float effects</span>
                      </div>
                    </div>
                    <div className={`w-10 h-6 rounded-full p-0.5 transition-colors ${perfMode ? 'bg-emerald-500' : 'bg-slate-600'}`}>
                      <motion.div
                        animate={{ x: perfMode ? 16 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-5 h-5 rounded-full bg-white shadow-md"
                      />
                    </div>
                  </motion.button>
                </div>
              </section>

              {/* ─── Layout & Display ─── */}
              {(showLayoutToggle || showUiModeToggle || showLogToggle) && (
                <section>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Layout & Display</h4>
                  <div className="space-y-2">
                    {showLayoutToggle && onToggleLayout && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={onToggleLayout}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{layout === 'table' ? '\u{1FA91}' : '\u{1F4CB}'}</span>
                          <span className="text-sm font-medium text-slate-200">
                            {layout === 'table' ? 'Table Layout' : 'Classic Layout'}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                          layout === 'table' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {layout === 'table' ? 'Table' : 'Classic'}
                        </span>
                      </motion.button>
                    )}

                    {showUiModeToggle && onToggleUiMode && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={onToggleUiMode}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{uiMode === 'actionbar' ? '\u{2261}' : '\u{25A1}'}</span>
                          <span className="text-sm font-medium text-slate-200">
                            {uiMode === 'actionbar' ? 'Action Bar Mode' : 'Modal Mode'}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                          uiMode === 'actionbar' ? 'bg-teal-900/50 text-teal-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {uiMode === 'actionbar' ? 'Action Bar' : 'Modal'}
                        </span>
                      </motion.button>
                    )}

                    {showLogToggle && onToggleLogPosition && (
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={onToggleLogPosition}
                        className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-base">{logPosition === 'left' ? '\u{2190}' : '\u{2193}'}</span>
                          <span className="text-sm font-medium text-slate-200">Game Log Position</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg ${
                          logPosition === 'left' ? 'bg-orange-900/50 text-orange-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {logPosition === 'left' ? 'Sidebar' : 'Bottom'}
                        </span>
                      </motion.button>
                    )}
                  </div>
                </section>
              )}

              {/* ─── Vote Kick ─── */}
              {onVoteKick && otherPlayers && otherPlayers.length > 0 && (
                <section>
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Vote to Kick</h4>
                  <div className="space-y-1.5">
                    {otherPlayers.map((p) => (
                      <motion.button
                        key={p.id}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        onClick={() => {
                          if (voteKickActive) return
                          if (!confirm(`Start a vote to kick ${p.name}?`)) return
                          onVoteKick(p.id)
                        }}
                        disabled={voteKickActive}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/40 hover:bg-red-900/20 hover:border-red-700/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span className="text-sm text-slate-200">{p.name}</span>
                        <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded-lg">
                          {voteKickActive ? 'Vote active' : 'Kick'}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </section>
              )}

              {/* ─── Leave Game ─── */}
              {onLeaveGame && (
                <section className="pt-2 border-t border-slate-700/40">
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={onLeaveGame}
                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-red-900/20 border border-red-700/30 hover:bg-red-900/40 transition-colors cursor-pointer"
                  >
                    <span className="text-base">{'\u{1F6AA}'}</span>
                    <span className="text-sm font-medium text-red-400">Leave Game</span>
                  </motion.button>
                </section>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
