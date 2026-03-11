import { useState, useEffect, useRef } from 'react'
import type { GameDoc, PlayerDoc, PrivatePlayerDoc } from '../lib/types'
import { subscribeGame, subscribePlayers, subscribePrivate } from '../lib/gameService'

/** Shallow-compare two PlayerDoc objects. Returns true if they differ. */
function playerChanged(prev: PlayerDoc, next: PlayerDoc): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return true
  for (const k of prevKeys) {
    const pv = (prev as unknown as Record<string, unknown>)[k]
    const nv = (next as unknown as Record<string, unknown>)[k]
    if (pv === nv) continue // primitive match — fast path
    // For arrays/objects (locks, lockedBy, hand, known): serialize for deep equality.
    // PlayerDoc fields are small — JSON.stringify is microseconds here.
    if (JSON.stringify(pv) !== JSON.stringify(nv)) return true
  }
  return false
}

export function useGame(gameId: string | undefined, playerId: string | undefined) {
  const [game, setGame] = useState<GameDoc | null>(null)
  const [players, setPlayers] = useState<Record<string, PlayerDoc>>({})
  const [privateState, setPrivateState] = useState<PrivatePlayerDoc | null>(null)
  const [loading, setLoading] = useState(true)
  // Stable cache: only replace individual player entries when their data actually changes.
  // This keeps the `players` object reference stable across snapshots that touch other players,
  // preventing unnecessary useMemo recalculations in Game.tsx.
  const playersCacheRef = useRef<Record<string, PlayerDoc>>({})

  useEffect(() => {
    if (!gameId) return
    playersCacheRef.current = {} // reset cache when game changes

    let initialLoad = true
    const unsub1 = subscribeGame(gameId, (g) => {
      setGame(g)
      if (initialLoad) {
        setLoading(false)
        initialLoad = false
      }
    })

    const unsub2 = subscribePlayers(gameId, (incoming) => {
      const cache = playersCacheRef.current
      let changed = false
      const next: Record<string, PlayerDoc> = {}

      // Carry over stable entries; replace only changed ones
      for (const [id, pd] of Object.entries(incoming)) {
        if (cache[id] && !playerChanged(cache[id], pd)) {
          next[id] = cache[id] // stable reference
        } else {
          next[id] = pd
          changed = true
        }
      }

      // Detect removed players
      for (const id of Object.keys(cache)) {
        if (!incoming[id]) changed = true
      }

      if (changed) {
        playersCacheRef.current = next
        setPlayers(next)
      }
      // If nothing changed, skip setPlayers entirely — zero re-renders
    })

    return () => {
      unsub1()
      unsub2()
    }
  }, [gameId])

  useEffect(() => {
    if (!gameId || !playerId) return
    const unsub = subscribePrivate(gameId, playerId, (p) => {
      setPrivateState(p)
    })
    return unsub
  }, [gameId, playerId])

  return { game, players, privateState, loading }
}
