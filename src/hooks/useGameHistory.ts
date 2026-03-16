import { useState, useCallback, useRef } from 'react'
import { fetchHistoryPage } from '../lib/supabaseGameService'
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

  const offsetRef = useRef(0)
  const loadingRef = useRef(false)

  const load = useCallback(async (resetFlag = false) => {
    if (!gameId || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    try {
      const offset = resetFlag ? 0 : offsetRef.current
      const { entries: newEntries, hasMore: more } = await fetchHistoryPage(gameId, offset)
      offsetRef.current = offset + newEntries.length
      setEntries((prev) => (resetFlag ? newEntries : [...prev, ...newEntries]))
      setHasMore(more)
    } catch (e) {
      console.error('History load failed:', e)
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [gameId])

  const reset = useCallback(() => {
    setEntries([])
    offsetRef.current = 0
    setHasMore(true)
  }, [])

  return { entries, loading, hasMore, load, reset }
}
