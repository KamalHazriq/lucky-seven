import { useState, useEffect } from 'react'
import { doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface GlobalStats {
  gamesPlayed: number
  lastGameAt: number | null
}

const INITIAL: GlobalStats = { gamesPlayed: 0, lastGameAt: null }

/**
 * Subscribe to global game statistics from Firestore.
 * Also tracks local visit count and time spent.
 */
export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats>(INITIAL)
  const [loading, setLoading] = useState(true)

  // Track total visits (local only — stored in localStorage)
  const [totalVisits] = useState(() => {
    const key = 'lucky7_visits'
    const current = parseInt(localStorage.getItem(key) ?? '0', 10)
    const next = current + 1
    localStorage.setItem(key, String(next))
    return next
  })

  // Track time spent (local only — accumulated in localStorage)
  const [timePlayed, setTimePlayed] = useState(() => {
    return parseInt(localStorage.getItem('lucky7_time_played') ?? '0', 10)
  })

  // Accumulate time played every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTimePlayed((prev) => {
        const next = prev + 30
        localStorage.setItem('lucky7_time_played', String(next))
        return next
      })
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Subscribe to Firestore global stats
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'stats', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setStats({
            gamesPlayed: data.gamesPlayed ?? 0,
            lastGameAt: data.lastGameAt ?? null,
          })
        }
        setLoading(false)
      },
      () => {
        // Doc doesn't exist yet — that's fine
        setLoading(false)
      },
    )
    return unsub
  }, [])

  return { stats, loading, totalVisits, timePlayed }
}

/** Format seconds into human-readable string */
export function formatTimePlayed(seconds: number): string {
  if (seconds < 60) return '< 1m'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}
