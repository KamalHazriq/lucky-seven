import { useState, useEffect } from 'react'
import { doc, onSnapshot, updateDoc, setDoc, increment } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface GlobalStats {
  gamesPlayed: number
  totalVisits: number
  lastGameAt: number | null
}

const INITIAL: GlobalStats = { gamesPlayed: 0, totalVisits: 0, lastGameAt: null }

/**
 * Subscribe to global game statistics from Firestore.
 * All stats are universal (cross-device) via a single shared Firestore doc.
 */
export function useGlobalStats() {
  const [stats, setStats] = useState<GlobalStats>(INITIAL)
  const [loading, setLoading] = useState(true)

  // Increment total visits once per page load (Firestore — universal)
  const [visitCounted] = useState(() => {
    // Use a session flag so we only count once per tab/session
    if (sessionStorage.getItem('lucky7_visit_counted')) return false
    sessionStorage.setItem('lucky7_visit_counted', '1')
    return true
  })

  useEffect(() => {
    if (!visitCounted) return
    const ref = doc(db, 'stats', 'global')
    updateDoc(ref, { totalVisits: increment(1) }).catch(async () => {
      // Doc may not exist yet — create it
      await setDoc(ref, { gamesPlayed: 0, totalVisits: 1, lastGameAt: null }).catch(() => {})
    })
  }, [visitCounted])

  // Subscribe to Firestore global stats
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'stats', 'global'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setStats({
            gamesPlayed: data.gamesPlayed ?? 0,
            totalVisits: data.totalVisits ?? 0,
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

  return { stats, loading }
}
