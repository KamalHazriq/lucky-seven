import { useEffect, useRef } from 'react'
import type { LogEntry, PlayerDoc } from '../lib/types'
import { isSfxEnabled, SFX } from '../lib/sfx'

/**
 * Plays SFX for remote player actions by watching actionVersion changes.
 *
 * Design:
 * - Fires on every actionVersion bump (same trigger as remote animations).
 * - Skips the local player's own actions — their handlers already call playSfx().
 * - Kick / leave / AFK events play for ALL remaining clients (actor has left).
 * - Respects the SFX enabled toggle via isSfxEnabled().
 * - No double-play: prevVersion ref guards against re-fires on re-render.
 *
 * Log message → SFX mapping:
 *   drew from the pile      → draw
 *   took from discard       → take
 *   discarded               → discard
 *   swapped their card      → swap  (draw resolution)
 *   as swap:                → swap  (queen power)
 *   as peek_one             → peek
 *   as peek_all             → peekAll
 *   as lock                 → lock
 *   as unlock               → unlock
 *   as rearrange            → chaos
 *   was kicked / AFK-kicked → kick  (all remaining clients)
 *   left the game           → kick  (all remaining clients)
 */
export function useRemoteSfx(
  actionVersion: number,
  log: LogEntry[],
  players: Record<string, PlayerDoc>,
  localUserId: string | undefined,
): void {
  const prevVersion = useRef(actionVersion)

  useEffect(() => {
    if (actionVersion === prevVersion.current) return
    prevVersion.current = actionVersion

    if (!isSfxEnabled()) return

    const lastEntry = log[log.length - 1]
    if (!lastEntry) return
    const msg = lastEntry.msg

    // ─── Kick / leave: actor is gone, play for all remaining clients ───
    if (
      msg.includes('was kicked') ||
      msg.includes('was AFK-kicked') ||
      msg.includes('left the game')
    ) {
      SFX.kick()
      return
    }

    // ─── Regular actions: only play for remote actors ──────────────────
    // (Local handlers already call playSfx() on their own actions.)
    let actorId: string | null = null
    for (const [pid, pd] of Object.entries(players)) {
      if (msg.startsWith(pd.displayName)) {
        actorId = pid
        break
      }
    }

    if (!actorId || actorId === localUserId) return

    if      (msg.includes('drew from the pile'))  SFX.draw()
    else if (msg.includes('took from discard'))   SFX.take()
    else if (msg.includes('discarded'))           SFX.discard()
    else if (msg.includes('swapped their card'))  SFX.swap()
    else if (msg.includes('as swap:'))            SFX.swap()
    else if (msg.includes('as peek_one'))         SFX.peek()
    else if (msg.includes('as peek_all'))         SFX.peekAll()
    else if (msg.includes('as lock'))             SFX.lock()
    else if (msg.includes('as unlock'))           SFX.unlock()
    else if (msg.includes('as rearrange'))        SFX.shuffle()
  }, [actionVersion, log, players, localUserId])
}
