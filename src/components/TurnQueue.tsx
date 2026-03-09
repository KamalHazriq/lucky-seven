import { motion } from 'framer-motion'
import type { PlayerDoc } from '../lib/types'
import { getSeatColor } from '../lib/playerColors'

interface TurnQueueProps {
  playerOrder: string[]
  players: Record<string, PlayerDoc>
  currentTurnPlayerId: string | null
  localPlayerId: string
}

export default function TurnQueue({
  playerOrder,
  players,
  currentTurnPlayerId,
  localPlayerId,
}: TurnQueueProps) {
  if (!currentTurnPlayerId || playerOrder.length < 2) return null

  const currentIdx = playerOrder.indexOf(currentTurnPlayerId)
  if (currentIdx === -1) return null

  // Build queue: current player + next 3 (or fewer if less players)
  const maxShow = Math.min(playerOrder.length, 4)
  const queue: { pid: string; queueNum: number }[] = []
  for (let i = 0; i < maxShow; i++) {
    const idx = (currentIdx + i) % playerOrder.length
    queue.push({ pid: playerOrder[idx], queueNum: i + 1 })
  }

  return (
    <div className="flex items-center gap-1.5 justify-center flex-wrap mb-3">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mr-1">
        Turn
      </span>
      {queue.map(({ pid, queueNum }, i) => {
        const pd = players[pid]
        if (!pd) return null
        const color = getSeatColor(pd.seatIndex)
        const isCurrent = queueNum === 1
        const isLocal = pid === localPlayerId
        const name = pd.displayName.length > 10
          ? pd.displayName.slice(0, 9) + '…'
          : pd.displayName

        return (
          <span key={pid} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-slate-600 text-[10px]">›</span>
            )}
            <motion.span
              layout
              className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
                ${isCurrent ? 'ring-1 ring-white/20 shadow-sm' : 'opacity-70'}
              `}
              style={{
                backgroundColor: isCurrent ? color.bg : 'rgba(100,116,139,0.15)',
                color: color.text,
                ...(isCurrent ? { boxShadow: `0 0 8px ${color.tinted}` } : {}),
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color.solid }}
              />
              <span className="truncate max-w-[72px]">
                {name}
              </span>
              {isLocal && (
                <span className="text-amber-300 text-[9px] font-bold">
                  (you)
                </span>
              )}
              {isCurrent && (
                <motion.span
                  animate={{ opacity: [1, 0.4, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  className="text-[9px]"
                >
                  ▶
                </motion.span>
              )}
            </motion.span>
          </span>
        )
      })}
    </div>
  )
}
