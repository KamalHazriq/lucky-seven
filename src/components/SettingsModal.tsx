import { motion } from 'framer-motion'
import { isSfxEnabled, setSfxEnabled, isHapticEnabled, setHapticEnabled, isPerformanceModeEnabled, setPerformanceModeEnabled } from '../lib/sfx'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useTheme, type Theme } from '../hooks/useTheme'
import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent
        className="max-w-sm rounded-2xl border-slate-700/60 bg-slate-800/95 backdrop-blur-md shadow-2xl shadow-black/40 p-0 gap-0 max-h-[85vh] flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{'\u2699\uFE0F'}</span>
              <DialogTitle className="text-lg font-bold text-amber-300">
                Settings
              </DialogTitle>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs"
            >
              {'\u2715'}
            </button>
          </div>
          <DialogDescription className="sr-only">
            Game settings and preferences
          </DialogDescription>
        </DialogHeader>

        <Separator className="bg-slate-700/40 mt-3" />

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-4 space-y-5">
            {/* ─── Theme ─── */}
            <section>
              <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Theme</Label>
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
              <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Audio & Feedback</Label>
              <div className="space-y-2">
                {/* SFX toggle */}
                <button
                  onClick={toggleSfx}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{sfx ? '\u{1F50A}' : '\u{1F507}'}</span>
                    <span className="text-sm font-medium text-slate-200">Sound Effects</span>
                  </div>
                  <Switch
                    checked={sfx}
                    onCheckedChange={toggleSfx}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </button>

                {/* Haptics toggle */}
                {hasVibrate && (
                  <button
                    onClick={toggleHaptic}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">{haptic ? '\u{1F4F3}' : '\u{1F4F4}'}</span>
                      <span className="text-sm font-medium text-slate-200">Vibration</span>
                    </div>
                    <Switch
                      checked={haptic}
                      onCheckedChange={toggleHaptic}
                      onClick={(e) => e.stopPropagation()}
                      className="data-[state=checked]:bg-purple-500"
                    />
                  </button>
                )}

                {/* Motion toggle */}
                <button
                  onClick={cycle}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                </button>

                {/* Performance mode toggle */}
                <button
                  onClick={togglePerfMode}
                  className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{perfMode ? '\u26A1' : '\u2728'}</span>
                    <div className="text-left">
                      <span className="text-sm font-medium text-slate-200 block">Performance Mode</span>
                      <span className="text-[10px] text-slate-500">Disables shimmer, glow & float effects</span>
                    </div>
                  </div>
                  <Switch
                    checked={perfMode}
                    onCheckedChange={togglePerfMode}
                    onClick={(e) => e.stopPropagation()}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </button>
              </div>
            </section>

            {/* ─── Layout & Display ─── */}
            {(showLayoutToggle || showUiModeToggle || showLogToggle) && (
              <section>
                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Layout & Display</Label>
                <div className="space-y-2">
                  {showLayoutToggle && onToggleLayout && (
                    <button
                      onClick={onToggleLayout}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                    </button>
                  )}

                  {showUiModeToggle && onToggleUiMode && (
                    <button
                      onClick={onToggleUiMode}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                    </button>
                  )}

                  {showLogToggle && onToggleLogPosition && (
                    <button
                      onClick={onToggleLogPosition}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-slate-800/60 transition-colors cursor-pointer"
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
                    </button>
                  )}
                </div>
              </section>
            )}

            {/* ─── Vote Kick — only available with 3+ players ─── */}
            {onVoteKick && otherPlayers && otherPlayers.length >= 2 && (
              <section>
                <Label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">Vote to Kick</Label>
                <div className="space-y-1.5">
                  {otherPlayers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (voteKickActive) return
                        if (!confirm(`Start a vote to kick ${p.name}?`)) return
                        onVoteKick(p.id)
                      }}
                      disabled={voteKickActive}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl border border-slate-700/40 bg-slate-900/40 hover:bg-red-900/20 hover:border-red-700/30 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="text-sm text-slate-200">{p.name}</span>
                      <span className="text-[10px] font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded-lg">
                        {voteKickActive ? 'Vote active' : 'Kick'}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ─── Leave Game ─── */}
            {onLeaveGame && (
              <>
                <Separator className="bg-slate-700/40" />
                <section>
                  <Button
                    onClick={onLeaveGame}
                    variant="ghost"
                    className="w-full h-11 rounded-xl bg-red-900/20 border border-red-700/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 font-medium cursor-pointer"
                  >
                    <span className="text-base mr-2">{'\u{1F6AA}'}</span>
                    Leave Game
                  </Button>
                </section>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
