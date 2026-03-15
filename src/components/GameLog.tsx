import { useEffect, useRef, useMemo, memo } from 'react'
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

function GameLog({ log, players, position = 'bottom' }: GameLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Track the actual last entry (not just length) — bounded log replaces entries
  // at cap so length stays at 50 while content changes.
  const lastLogKey = log.length > 0 ? `${log[log.length - 1].ts}-${log[log.length - 1].msg.slice(0, 24)}` : ''

  useEffect(() => {
    if (document.hidden) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lastLogKey])

  // Build player info list for name matching
  const playerInfos = useMemo(() =>
    Object.values(players).map((p) => ({
      displayName: p.displayName,
      seatIndex: p.seatIndex,
    })),
    [players],
  )

  const isLeft = position === 'left'
  // Sidebar shows all 50 kept entries; bottom panel shows last 30
  const entries = isLeft ? log.slice(-50) : log.slice(-30)
  const totalEntries = entries.length

  return (
    <div
      className={`rounded-xl border overflow-y-auto ${
        isLeft
          ? 'h-full p-2.5'
          : 'max-h-48 p-3'
      }`}
      style={{
        background: 'var(--panel)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="mb-2 px-1 flex items-center gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-dim)' }}>
          Game Log
        </h3>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>
      <div className="flex flex-col gap-px">
        <AnimatePresence initial={false}>
          {entries.map((entry, i) => {
            const key = `${entry.ts}-${entry.msg.slice(0, 24)}`
            const recency = totalEntries - i
            const opacity = recency <= 3 ? 1 : recency <= 8 ? 0.7 : 0.45

            return (
              <motion.div
                key={key}
                initial={{ x: -6, scale: 0.98 }}
                animate={{ x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.4 }}
                style={{
                  opacity,
                  transition: 'opacity 0.4s ease',
                  ...(recency <= 1 ? { background: 'var(--surface, rgba(30,41,59,0.2))' } : {}),
                }}
                className="flex items-center gap-1 min-h-[24px] px-1.5 py-0.5 rounded-md"
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

export default memo(GameLog)
