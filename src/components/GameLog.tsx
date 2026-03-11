import { useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { renderLogMessage } from '../lib/logRenderer'
import type { LogPosition } from '../hooks/useLogPosition'

interface GameLogProps {
  log: LogEntry[]
  players: Record<string, PlayerDoc>
  /** Display mode — 'bottom' (default) or 'left' (sidebar) */
  position?: LogPosition
  onOpenHistory?: () => void
}

export default function GameLog({ log, players, position = 'bottom', onOpenHistory }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (document.hidden) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log.length])

  // Build player info list for name matching
  const playerInfos = useMemo(() =>
    Object.values(players).map((p) => ({
      displayName: p.displayName,
      seatIndex: p.seatIndex,
    })),
    [players],
  )

  const isLeft = position === 'left'
  // Sidebar shows more entries; bottom panel stays compact
  const entries = isLeft ? log.slice(-50) : log.slice(-30)
  const totalEntries = entries.length

  return (
    <div
      className={`rounded-xl border overflow-y-auto ${
        isLeft
          ? 'h-full bg-slate-900/50 border-slate-700/40 p-2.5'
          : 'max-h-48 bg-slate-900/60 border-slate-700/50 p-3'
      }`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          Game Log
        </h3>
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            className="text-[10px] text-slate-500 hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-0.5"
            title="Full history"
          >
            <span>🕐</span>
            <span>History</span>
          </button>
        )}
      </div>
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            // Stable key: ts + message prefix. Avoids re-keying when slice window shifts.
            const key = `${entry.ts}-${entry.msg.slice(0, 24)}`
            // Dim older entries — use style+CSS transition instead of framer animate
            // so opacity changes don't trigger a new framer animation per entry.
            const recency = totalEntries - i
            const opacity = recency <= 3 ? 1 : recency <= 8 ? 0.7 : 0.5

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, x: -8, scale: 0.97 }}
                animate={{ x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 350, damping: 28, mass: 0.5 }}
                style={{ opacity, transition: 'opacity 0.4s ease' }}
                className={`flex items-center gap-1 min-h-[26px] px-1 rounded-md ${
                  recency <= 1 ? 'bg-slate-800/30' : ''
                }`}
              >
                <div className="flex-1 min-w-0 text-[11px] leading-snug flex flex-wrap items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                  {renderLogMessage(entry.msg, playerInfos)}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
