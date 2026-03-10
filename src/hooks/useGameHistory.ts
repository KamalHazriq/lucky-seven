import { useState, useCallback, useRef } from 'react'
import type { DocumentSnapshot } from 'firebase/firestore'
import { fetchHistoryPage } from '../lib/gameService'
import type { LogEntry } from '../lib/types'

export interface GameHistoryState {
  entries: LogEntry[]
  loading: boolean
  hasMore: boolean
  load: (reset?: boolean) => Promise<void>
  reset: () => void
}

export function useGameHistory(gameId: string | undefined): GameHistoryState {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)

  const cursorRef = useRef<DocumentSnapshot | null>(null)
  const loadingRef = useRef(false)

  const load = useCallback(async (resetFlag = false) => {
    if (!gameId || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const cursor = resetFlag ? null : cursorRef.current
      const { entries: newEntries, lastDoc } = await fetchHistoryPage(gameId, cursor)
      cursorRef.current = lastDoc
      setEntries((prev) => (resetFlag ? newEntries : [...prev, ...newEntries]))
      setHasMore(lastDoc !== null)
    } catch (e) {
      console.error('History load failed:', e)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [gameId])

  const reset = useCallback(() => {
    setEntries([])
    cursorRef.current = null
    setHasMore(true)
  }, [])

  return { entries, loading, hasMore, load, reset }
}
