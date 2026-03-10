import { useEffect, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { renderLogMessage } from '../lib/logRenderer'
import type { PlayerDoc } from '../lib/types'
import type { GameHistoryState } from '../hooks/useGameHistory'

interface HistoryModalProps {
  open: boolean
  onClose: () => void
  gameId: string | undefined
  players: Record<string, PlayerDoc>
  history: GameHistoryState
}

export default function HistoryModal({ open, onClose, gameId, players, history }: HistoryModalProps) {
  const { entries, loading, hasMore, load, reset } = history
  const loadedRef = useRef(false)

  const playerInfos = useMemo(
    () => Object.values(players).map((p) => ({ displayName: p.displayName, seatIndex: p.seatIndex })),
    [players],
  )

  // Load fresh data each time modal opens
  useEffect(() => {
    if (open && gameId && !loadedRef.current) {
      loadedRef.current = true
      reset()
      load(true)
    }
    if (!open) {
      loadedRef.current = false
    }
  }, [open, gameId, load, reset])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, y: 32, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26, mass: 0.6 }}
            className="fixed z-50 inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[480px] top-[10vh] bottom-[10vh] max-h-[80vh] bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base">🕐</span>
                <h2 className="text-sm font-semibold text-slate-100">Full Game History</h2>
                {entries.length > 0 && (
                  <span className="text-[10px] text-slate-500 font-mono">{entries.length} events</span>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs"
              >
                &times;
              </button>
            </div>

            {/* Entries — newest first */}
            <div className="flex-1 overflow-y-auto p-3 space-y-0.5">
              {loading && entries.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-8">Loading history…</p>
              )}
              {!loading && entries.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-8">No history yet.</p>
              )}

              {entries.map((entry, i) => (
                <div
                  key={`${entry.ts}-${i}`}
                  className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800/40 transition-colors"
                >
                  <span className="text-[10px] text-slate-600 font-mono flex-shrink-0 mt-0.5 tabular-nums">
                    {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <div className="flex-1 min-w-0 text-[11px] leading-snug flex flex-wrap items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                    {renderLogMessage(entry.msg, playerInfos)}
                  </div>
                </div>
              ))}

              {/* Load more */}
              {(hasMore || loading) && entries.length > 0 && (
                <div className="flex justify-center pt-3 pb-1">
                  <button
                    onClick={() => load(false)}
                    disabled={loading}
                    className="px-4 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}

              {!hasMore && entries.length > 0 && (
                <p className="text-[10px] text-slate-600 text-center py-2">
                  — Beginning of game history —
                </p>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
