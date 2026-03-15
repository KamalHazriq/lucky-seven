import { useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import type { LogEntry, PlayerDoc } from '../lib/types'

/**
 * Shows a subtle toast notification when a remote player uses a power card.
 *
 * Watches actionVersion bumps (same pattern as useRemoteSfx) and parses
 * the latest log entry. Only fires for power actions by other players.
 *
 * Power log patterns:
 *   "{name} used (card) as swap: {name} #X ↔ {name} #Y"
 *   "{name} used (card) as peek_one / peek_all"
 *   "{name} used (card) as lock: {name} #X"
 *   "{name} used (card) as unlock: {name} #X"
 *   "{name} used (card) as rearrange: shuffled {name}'s cards"
 */

const POWER_PATTERNS: { test: RegExp; icon: string }[] = [
  { test: /as swap:/i,      icon: '🔀' },
  { test: /as peek_all/i,   icon: '👀' },
  { test: /as peek_one/i,   icon: '👁️' },
  { test: /as lock/i,       icon: '🔒' },
  { test: /as unlock/i,     icon: '🔓' },
  { test: /as rearrange/i,  icon: '🌀' },
  { test: /as peek_opponent/i, icon: '👁️' },
]

export function useRemotePowerToast(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
  localUserId: string | undefined,
): void {
  const prevVersion = useRef(actionVersion)

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion

    const lastEntry = log[log.length - 1]
    if (!lastEntry) return
    const msg = lastEntry.msg

    // Only show toasts for power usage (contains "as <power>")
    const match = POWER_PATTERNS.find((p) => p.test.test(msg))
    if (!match) return

    // Identify the actor — skip if it's the local player
    let actorId: string | null = null
    for (const [pid, pd] of Object.entries(players)) {
      if (msg.startsWith(pd.displayName)) {
        actorId = pid
        break
      }
    }
    if (!actorId || actorId === localUserId) return

    // Clean up the message for display: strip "used (card) " prefix noise
    // Show: "Sara used SWAP on Kamal's #1 ↔ Imad's #2"
    const cleaned = msg
      .replace(/\([^)]*[♠♥♦♣][^)]*\)/g, '') // remove card references like (10♠)
      .replace(/\(Joker\)/gi, '')
      .replace(/as swap:/i, 'used SWAP:')
      .replace(/as peek_one[^:]*/i, 'used PEEK')
      .replace(/as peek_all[^:]*/i, 'used PEEK ALL')
      .replace(/as lock:/i, 'used LOCK:')
      .replace(/as unlock:/i, 'used UNLOCK:')
      .replace(/as rearrange:/i, 'used CHAOS:')
      .replace(/as peek_opponent:/i, 'used PEEK OPPONENT:')
      .replace(/\s*used\s+used/i, ' used') // prevent double "used used"
      .replace(/\s{2,}/g, ' ')
      .trim()

    toast(cleaned, {
      icon: match.icon,
      duration: 3000,
      style: {
        background: 'rgba(30, 41, 59, 0.95)',
        color: '#e2e8f0',
        border: '1px solid rgba(100, 116, 139, 0.3)',
        fontSize: '12px',
        fontWeight: '500',
        maxWidth: '320px',
        backdropFilter: 'blur(8px)',
      },
    })
  }, [actionVersion, log, players, localUserId])
}
