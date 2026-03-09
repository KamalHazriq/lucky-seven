import { type ReactNode } from 'react'
import { getSeatColor } from './playerColors'

interface PlayerInfo {
  displayName: string
  seatIndex: number
}

/**
 * Renders a log message with player names highlighted as colored chips.
 * Names are matched longest-first to avoid partial matches.
 */
export function renderLogMessage(
  msg: string,
  playerMap: PlayerInfo[],
): ReactNode {
  if (playerMap.length === 0) return msg

  // Sort by name length descending so longer names match first
  const sorted = [...playerMap].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  )

  // Build a regex matching any player name
  const escaped = sorted.map((p) =>
    p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )
  const pattern = new RegExp(`(${escaped.join('|')})`, 'g')

  // Build a name → seatIndex lookup
  const nameToSeat: Record<string, number> = {}
  for (const p of sorted) {
    nameToSeat[p.displayName] = p.seatIndex
  }

  const parts = msg.split(pattern)
  if (parts.length === 1) return msg

  return parts.map((part, i) => {
    const seat = nameToSeat[part]
    if (seat !== undefined) {
      const color = getSeatColor(seat)
      return (
        <span
          key={i}
          className="inline-block px-1.5 py-0 rounded text-[10px] font-bold leading-relaxed"
          style={{
            backgroundColor: color.bg,
            color: color.text,
          }}
        >
          {part}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}
