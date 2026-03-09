import { motion, AnimatePresence } from 'framer-motion'
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
  /** Floating chat bubble text — UI only, auto-cleared by parent */
  chatBubble?: string | null
  /** Queue number (1 = current turn, 2 = next, etc.) */
  queueNumber?: number | null
  /** Per-slot effect overlays: slotIndex → color (actor's color) */
  slotOverlays?: Record<number, string> | null
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
  chatBubble,
  queueNumber,
  slotOverlays,
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
          ? 'bg-emerald-900/40 border-2 border-amber-500/50 ring-1 ring-emerald-500/30 turn-glow'
          : isCurrentTurn
            ? 'bg-emerald-900/40 border-2 border-emerald-500/50 turn-glow'
            : isLocalPlayer
              ? 'bg-amber-900/15 border-2 border-amber-500/30'
              : 'bg-slate-800/40 border border-slate-700/50'
        }
      `}
      style={{
        borderLeftWidth: '4px',
        borderLeftColor: color.solid,
        ...(isCurrentTurn ? { '--turn-glow-color': color.solid + '60' } as React.CSSProperties : {}),
      }}
    >
      {/* Chat bubble — floating above panel */}
      <AnimatePresence>
        {chatBubble && (
          <motion.div
            key={chatBubble}
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.9 }}
            className="absolute -top-9 left-4 right-4 z-20 pointer-events-none"
          >
            <div
              className="inline-block max-w-full px-2.5 py-1 rounded-xl text-[11px] font-medium text-white truncate shadow-lg"
              style={{ backgroundColor: color.solid }}
            >
              {chatBubble}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action highlight overlay — expanding pulse ring */}
      {actionHighlight && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 rounded-2xl pointer-events-none z-10 action-pulse-ring"
          style={{
            boxShadow: `inset 0 0 0 2.5px ${actionHighlight.color}, 0 0 16px ${actionHighlight.color}, 0 0 32px ${actionHighlight.color}20`,
          }}
        >
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-md"
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
        {queueNumber != null && (
          <span
            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold"
            style={{ backgroundColor: color.bg, color: color.text }}
          >
            #{queueNumber}
          </span>
        )}
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
          const slotColor = slotOverlays?.[i]

          const slotWrapper = (child: React.ReactNode) => (
            <div key={i} className="relative">
              {child}
              {slotColor && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 rounded-xl pointer-events-none z-10 slot-pulse-ring"
                  style={{
                    boxShadow: `inset 0 0 0 2px ${slotColor}, 0 0 12px ${slotColor}80, 0 0 24px ${slotColor}30`,
                  }}
                />
              )}
            </div>
          )

          if (isLocalPlayer && isKnown) {
            return slotWrapper(
              <CardView
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
              />,
            )
          }

          return slotWrapper(
            <CardView
              card={card}
              faceUp={false}
              locked={isLocked}
              lockInfo={isLocked ? lockInfo : null}
              size={isLocalPlayer ? 'md' : 'sm'}
              onClick={slotClickable && isLocalPlayer ? () => onSlotClick?.(i) : undefined}
              highlight={slotClickable && isLocalPlayer && !isLocked}
              disabled={slotClickable && isLocked}
              label={isLocalPlayer ? `#${i + 1}` : undefined}
              ownerColor={color.solid}
            />,
          )
        })}
      </div>
    </motion.div>
  )
}
