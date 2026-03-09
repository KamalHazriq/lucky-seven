import { motion } from 'framer-motion'
import CardView from './CardView'
import type { Card, PrivatePlayerDoc, LockInfo } from '../lib/types'
import { getSeatColor } from '../lib/playerColors'

export interface ActionHighlight {
  color: string
  label: string
}

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
  /** Temporary action highlight — pulsing colored ring with label */
  actionHighlight?: ActionHighlight | null
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
  seatIndex,
  connected,
  locks,
  lockedBy,
  onSlotClick,
  slotClickable = false,
  actionHighlight,
}: PlayerPanelProps) {
  const hand = privateState?.hand ?? []
  const known = privateState?.known ?? {}
  const lockInfos = lockedBy ?? EMPTY_LOCKED_BY
  const color = getSeatColor(seatIndex)

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
      style={{
        borderLeftWidth: '4px',
        borderLeftColor: color.solid,
      }}
    >
      {/* Action highlight overlay — temporary pulsing ring */}
      {actionHighlight && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.2, repeat: 1 }}
          className="absolute inset-0 rounded-2xl pointer-events-none z-10"
          style={{
            boxShadow: `inset 0 0 0 2px ${actionHighlight.color}, 0 0 12px ${actionHighlight.color}`,
          }}
        >
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ backgroundColor: actionHighlight.color, color: '#fff' }}
          >
            {actionHighlight.label}
          </span>
        </motion.div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-2.5 h-2.5 rounded-full ring-1 ring-white/20"
          style={{ backgroundColor: connected ? color.solid : '#64748b' }}
        />
        <span
          className="font-semibold text-sm"
          style={{ color: isLocalPlayer ? '#fcd34d' : color.text }}
        >
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
              ownerColor={color.tinted}
            />
          )
        })}
      </div>
    </motion.div>
  )
}
