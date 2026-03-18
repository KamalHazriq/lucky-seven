import { useState, useEffect, useCallback } from 'react'
import type { DevAccessDoc, DevPrivileges, PrivatePlayerDoc, Card } from '../lib/types'
import {
  activateDevMode as activateDevModeFn,
  deactivateDevMode as deactivateDevModeFn,
  subscribeDevAccess,
  subscribeAllPrivate,
  subscribeDrawPile,
} from '../lib/supabaseGameService'
import { trackEvent } from '../lib/analytics'

export interface UseDevModeReturn {
  /** Whether dev mode is currently active for this user */
  isDevMode: boolean
  /** Current dev privileges (null when inactive) */
  privileges: DevPrivileges | null
  /** Dev access metadata */
  devAccess: DevAccessDoc | null
  /** All players' private data (only subscribed when dev mode is active) */
  allPlayerHands: Record<string, PrivatePlayerDoc>
  /** Draw pile cards (only subscribed when dev mode is active) */
  drawPileCards: Card[]
  /** Activate dev mode with an access code */
  activate: (code: string) => Promise<void>
  /** Deactivate dev mode */
  deactivate: () => Promise<void>
  /** Whether an activate/deactivate operation is in progress */
  loading: boolean
  /** Last error message from activate/deactivate */
  error: string | null
}

export function useDevMode(
  gameId: string | undefined,
  uid: string | undefined,
): UseDevModeReturn {
  const [devAccess, setDevAccess] = useState<DevAccessDoc | null>(null)
  const [allPlayerHands, setAllPlayerHands] = useState<Record<string, PrivatePlayerDoc>>({})
  const [drawPileCards, setDrawPileCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDevMode = !!devAccess
  const privileges = devAccess?.privileges ?? null

  // Subscribe to dev access status
  useEffect(() => {
    if (!gameId || !uid) return
    return subscribeDevAccess(gameId, uid, setDevAccess)
  }, [gameId, uid])

  // When dev mode is active, subscribe to all players' private data
  useEffect(() => {
    if (!gameId || !isDevMode || !privileges?.canSeeAllCards) return
    return subscribeAllPrivate(gameId, setAllPlayerHands)
  }, [gameId, isDevMode, privileges?.canSeeAllCards])

  // When dev mode is active, subscribe to draw pile
  useEffect(() => {
    if (!gameId || !isDevMode || !privileges?.canPeekDrawPile) return
    return subscribeDrawPile(gameId, setDrawPileCards)
  }, [gameId, isDevMode, privileges?.canPeekDrawPile])

  // Clear extra subscriptions when dev mode is deactivated
  useEffect(() => {
    if (!isDevMode) {
      setAllPlayerHands({})
      setDrawPileCards([])
    }
  }, [isDevMode])

  const activate = useCallback(async (code: string) => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    try {
      await activateDevModeFn(gameId, code)
      trackEvent('dev_mode_activated', {}, gameId)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Activation failed'
      setError(msg)
      throw e
    } finally {
      setLoading(false)
    }
  }, [gameId])

  const deactivate = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    try {
      await deactivateDevModeFn(gameId)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Deactivation failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [gameId])

  return {
    isDevMode,
    privileges,
    devAccess,
    allPlayerHands,
    drawPileCards,
    activate,
    deactivate,
    loading,
    error,
  }
}
