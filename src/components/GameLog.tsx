import { useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { renderLogMessage } from '../lib/logRenderer'

interface GameLogProps {
  log: LogEntry[]
  players: Record<string, PlayerDoc>
}

export default function GameLog({ log, players }: GameLogProps) {
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

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-700/50 p-3 max-h-48 overflow-y-auto">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Game Log</h3>
      <AnimatePresence initial={false}>
        {log.slice(-20).map((entry, i) => (
          <motion.div
            key={`${entry.ts}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-xs text-slate-400 py-1 border-b border-slate-800/50 last:border-0 leading-relaxed"
          >
            {renderLogMessage(entry.msg, playerInfos)}
          </motion.div>
        ))}
      </AnimatePresence>
      <div ref={bottomRef} />
    </div>
  )
}
