import { useState, useEffect, useRef, useCallback } from 'react'
import { skipTurn } from '../lib/gameService'
import type { GameDoc } from '../lib/types'

interface TurnTimerState {
  /** Seconds remaining (null if timer disabled or no active turn) */
  remaining: number | null
  /** Total seconds configured for the timer */
  total: number
  /** Whether this client is responsible for triggering auto-skip */
  isExpired: boolean
}

/**
 * Hook that tracks the turn timer countdown.
 * All clients run the timer independently; only the first client to call
 * skipTurn succeeds thanks to the actionVersion guard.
 */
export function useTurnTimer(
  game: GameDoc | null | undefined,
  gameId: string | undefined,
  _localPlayerId: string | undefined,
): TurnTimerState {
  const [remaining, setRemaining] = useState<number | null>(null)
  const skipFiredRef = useRef(false)

  const turnSeconds = game?.settings?.turnSeconds ?? 0
  const turnStartAt = game?.turnStartAt ?? 0
  const currentTurnPlayerId = game?.currentTurnPlayerId ?? null
  const actionVersion = game?.actionVersion ?? 0
  const isActive = game?.status === 'active' || game?.status === 'ending'

  // Reset skip-fired flag only on actual turn change (new player or new timer start)
  useEffect(() => {
    skipFiredRef.current = false
  }, [currentTurnPlayerId, turnStartAt])

  // Main countdown interval
  useEffect(() => {
    // No timer if disabled, no active turn, or game not active
    if (turnSeconds === 0 || !currentTurnPlayerId || !isActive || !turnStartAt) {
      setRemaining(null)
      return
    }

    const tick = () => {
      const elapsed = (Date.now() - turnStartAt) / 1000
      // Clamp to [0, turnSeconds] to handle clock-skew between devices
      const left = Math.min(turnSeconds, Math.max(0, turnSeconds - elapsed))
      setRemaining(Math.ceil(left))
    }

    tick() // immediate first tick
    const id = setInterval(tick, 250) // update 4x/sec for smooth UI
    return () => clearInterval(id)
  }, [turnSeconds, turnStartAt, currentTurnPlayerId, isActive])

  // Auto-skip trigger when timer expires
  const handleExpiry = useCallback(async () => {
    if (!gameId || skipFiredRef.current) return
    // Elapsed guard: prevent stale re-fires after a turn change resets turnStartAt.
    // If the new turn just started (elapsed << turnSeconds) this is a double-fire artifact.
    const elapsed = turnStartAt ? (Date.now() - turnStartAt) / 1000 : 0
    if (elapsed < turnSeconds * 0.9) return
    skipFiredRef.current = true
    try {
      await skipTurn(gameId, actionVersion)
    } catch (e) {
      // Expected: another client may have already skipped
      console.debug('Auto-skip contention (expected):', e)
    }
  }, [gameId, actionVersion, turnStartAt, turnSeconds])

  useEffect(() => {
    if (remaining !== null && remaining <= 0 && turnSeconds > 0 && isActive && currentTurnPlayerId) {
      handleExpiry()
    }
  }, [remaining, turnSeconds, isActive, currentTurnPlayerId, handleExpiry])

  return {
    remaining,
    total: turnSeconds,
    isExpired: remaining !== null && remaining <= 0,
  }
}
