import { useState, useEffect, useRef } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { getSeatColor } from '../lib/playerColors'

export interface ActionHighlightInfo {
  color: string
  label: string
}

type HighlightMap = Record<string, ActionHighlightInfo | null>

/**
 * Watches actionVersion changes and parses the latest log entry
 * to produce temporary per-player highlights that auto-clear.
 */
export function useActionHighlight(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
): HighlightMap {
  const [highlights, setHighlights] = useState<HighlightMap>({})
  const prevVersion = useRef(actionVersion)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion

    const lastEntry = log[log.length - 1]
    if (!lastEntry) return

    const msg = lastEntry.msg

    // Find which player is the actor (name appears before the first verb)
    let actorId: string | null = null
    let actorSeat = 0

    for (const [pid, pd] of Object.entries(players)) {
      if (msg.startsWith(pd.displayName)) {
        actorId = pid
        actorSeat = pd.seatIndex
        break
      }
    }

    if (!actorId) return

    // Determine action label from keywords
    let label = 'acted'
    if (msg.includes('drew from the pile')) label = 'drew'
    else if (msg.includes('took from discard')) label = 'took discard'
    else if (msg.includes('swapped their card')) label = 'swapped'
    else if (msg.includes('discarded')) label = 'discarded'
    else if (msg.includes('as swap:')) label = 'swapped'
    else if (msg.includes('as peek')) label = 'peeked'
    else if (msg.includes('as lock')) label = 'locked'
    else if (msg.includes('as unlock')) label = 'unlocked'
    else if (msg.includes('as rearrange')) label = 'shuffled'
    else if (msg.includes('called END')) label = 'called END'

    const color = getSeatColor(actorSeat)

    setHighlights({ [actorId]: { color: color.solid, label } })

    // Clear previous timer
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      setHighlights({})
    }, 1500)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [actionVersion, log, players])

  return highlights
}
