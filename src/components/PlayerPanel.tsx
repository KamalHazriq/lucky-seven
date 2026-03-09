import { motion } from 'framer-motion'
import CardView from './CardView'
import type { Card, PrivatePlayerDoc, LockInfo } from '../lib/types'

interface PlayerPanelProps {
  displayName: string
  playerId: string
  isCurrentTurn: boolean
  isLocalPlayer: boolean
  privateState?: PrivatePlayerDoc | null
  seatIndex: number
  connected: boolean
  locks: [boolean, boolean, boolean]
  lockedBy?: [LockInfo, LockInfo, LockInfo]
  onSlotClick?: (slotIndex: number) => void
  slotClickable?: boolean
}

const EMPTY_LOCKED_BY: [LockInfo, LockInfo, LockInfo] = [
  { lockerId: null, lockerName: null },
  { lockerId: null, lockerName: null },
  { lockerId: null, lockerName: null },
]

export default function PlayerPanel({
  displayName,
  isCurrentTurn,
  isLocalPlayer,
  privateState,
  connected,
  locks,
  lockedBy,
  onSlotClick,
  slotClickable = false,
}: PlayerPanelProps) {
  const hand = privateState?.hand ?? []
  const known = privateState?.known ?? {}
  const lockInfos = lockedBy ?? EMPTY_LOCKED_BY

  return (
    <motion.div
      layout
      className={`
        relative rounded-2xl p-4 backdrop-blur-sm
        ${isLocalPlayer && isCurrentTurn
          ? 'bg-emerald-900/40 border-2 border-amber-500/50 shadow-lg shadow-amber-500/10 ring-1 ring-emerald-500/30'
          : isCurrentTurn
            ? 'bg-emerald-900/40 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
            : isLocalPlayer
              ? 'bg-amber-900/15 border-2 border-amber-500/30'
              : 'bg-slate-800/40 border border-slate-700/50'
        }
      `}
    >
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
        <span className={`font-semibold text-sm ${isLocalPlayer ? 'text-amber-300' : 'text-slate-200'}`}>
          {displayName}
        </span>
        {isLocalPlayer && (
          <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded-md">
            YOU
          </span>
        )}
        {isCurrentTurn && (
          <motion.span
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="ml-auto text-xs font-medium text-emerald-400"
          >
            {isLocalPlayer ? 'Your turn' : 'Playing...'}
          </motion.span>
        )}
      </div>

      <div className="flex gap-2 justify-center">
        {[0, 1, 2].map((i) => {
          const card = hand[i] as Card | undefined
          const knownCard = known[String(i)]
          const isKnown = !!knownCard
          const isLocked = locks[i]
          const lockInfo = lockInfos[i]

          if (isLocalPlayer && isKnown) {
            return (
              <CardView
                key={i}
                card={knownCard}
                faceUp
                known
                locked={isLocked}
                lockInfo={isLocked ? lockInfo : null}
                size="md"
                onClick={slotClickable ? () => onSlotClick?.(i) : undefined}
                highlight={slotClickable && !isLocked}
                disabled={slotClickable && isLocked}
                label={`#${i + 1}`}
              />
            )
          }

          return (
            <CardView
              key={i}
              card={card}
              faceUp={false}
              locked={isLocked}
              lockInfo={isLocked ? lockInfo : null}
              size={isLocalPlayer ? 'md' : 'sm'}
              onClick={slotClickable && isLocalPlayer ? () => onSlotClick?.(i) : undefined}
              highlight={slotClickable && isLocalPlayer && !isLocked}
              disabled={slotClickable && isLocked}
              label={isLocalPlayer ? `#${i + 1}` : undefined}
            />
          )
        })}
      </div>
    </motion.div>
  )
}
