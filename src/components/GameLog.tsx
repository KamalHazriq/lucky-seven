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
}

export default function GameLog({ log, players, position = 'bottom' }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
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
  const entries = log.slice(-30)
  const totalEntries = entries.length

  return (
    <div
      className={`rounded-xl border overflow-y-auto ${
        isLeft
          ? 'h-full bg-slate-900/50 border-slate-700/40 p-2.5'
          : 'max-h-48 bg-slate-900/60 border-slate-700/50 p-3'
      }`}
    >
      <h3 className="text-[10px] font-semibold uppercase tracking-widest mb-2 px-1" style={{ color: 'var(--text-dim)' }}>
        Game Log
      </h3>
      <div className="flex flex-col">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            // Dim older entries for visual hierarchy
            const recency = totalEntries - i
            const opacity = recency <= 3 ? 1 : recency <= 8 ? 0.7 : 0.5

            return (
              <motion.div
                key={`${entry.ts}-${i}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity, x: 0 }}
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
