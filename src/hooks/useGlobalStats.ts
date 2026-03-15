import { useState, useEffect } from 'react'
import { doc, getDoc, updateDoc, setDoc, increment } from 'firebase/firestore'
import { db } from '../lib/firebase'

export interface GlobalStats {
  gamesPlayed: number
  totalVisits: number
  lastGameAt: number | null
}

const INITIAL: GlobalStats = { gamesPlayed: 0, totalVisits: 0, lastGameAt: null }

/**
 * Fetch global game statistics from Firestore (single read, no live listener).
 * Stats are universal (cross-device) via a single shared Firestore doc.
 *
 * Uses getDoc instead of onSnapshot to save one active listener on the Home page.
 * Stats rarely change mid-session — a one-time read is sufficient.
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

  // Single read instead of live listener — stats rarely change mid-session
  useEffect(() => {
    getDoc(doc(db, 'stats', 'global'))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data()
          setStats({
            gamesPlayed: data.gamesPlayed ?? 0,
            totalVisits: data.totalVisits ?? 0,
            lastGameAt: data.lastGameAt ?? null,
          })
        }
      })
      .catch(() => {
        // Doc doesn't exist yet — that's fine
      })
      .finally(() => setLoading(false))
  }, [])

  return { stats, loading }
}
