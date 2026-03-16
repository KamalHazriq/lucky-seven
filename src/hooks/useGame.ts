import { useState, useEffect, useRef } from 'react'
import type { GameDoc, PlayerDoc, PrivatePlayerDoc } from '../lib/types'
import { supabase, ensureAuth } from '../lib/supabase'
import { mapGameRow, mapPlayerRow, mapPrivateStateRow } from '../lib/supabaseMappers'

/** Shallow-compare two PlayerDoc objects. Returns true if they differ. */
function playerChanged(prev: PlayerDoc, next: PlayerDoc): boolean {
  const prevKeys = Object.keys(prev)
  const nextKeys = Object.keys(next)
  if (prevKeys.length !== nextKeys.length) return true
  for (const k of prevKeys) {
    const pv = (prev as unknown as Record<string, unknown>)[k]
    const nv = (next as unknown as Record<string, unknown>)[k]
    if (pv === nv) continue // primitive match — fast path
    if (JSON.stringify(pv) !== JSON.stringify(nv)) return true
  }
  return false
}

export function useGame(gameId: string | undefined, playerId: string | undefined) {
  const [game, setGame] = useState<GameDoc | null>(null)
  const [players, setPlayers] = useState<Record<string, PlayerDoc>>({})
  const [privateState, setPrivateState] = useState<PrivatePlayerDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const playersCacheRef = useRef<Record<string, PlayerDoc>>({})

  // ─── Game + Players subscription ─────────────────────────────
  useEffect(() => {
    if (!gameId) return
    playersCacheRef.current = {}
    let cancelled = false

    // Create channel and register handlers synchronously
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setGame(mapGameRow(payload.new))
          }
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new
            const pid = row.player_id as string
            const mapped = mapPlayerRow(row)
            setPlayers((prev) => {
              const cache = playersCacheRef.current
              if (cache[pid] && !playerChanged(cache[pid], mapped)) return prev
              const next = { ...prev, [pid]: mapped }
              playersCacheRef.current = next
              return next
            })
          } else if (payload.eventType === 'DELETE') {
            const pid = payload.old?.player_id as string | undefined
            if (!pid) return
            setPlayers((prev) => {
              const next = { ...prev }
              delete next[pid]
              playersCacheRef.current = next
              return next
            })
          }
        },
      )

    // Auth → subscribe → fetch (ensures JWT is ready for RLS)
    ensureAuth().then(() => {
      if (cancelled) return

      channel.subscribe()

      // Initial fetch
      Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase.from('game_players').select('*').eq('game_id', gameId),
      ]).then(([gameRes, playersRes]) => {
        if (cancelled) return
        if (gameRes.data) setGame(mapGameRow(gameRes.data))
        if (playersRes.data) {
          const mapped: Record<string, PlayerDoc> = {}
          for (const row of playersRes.data) {
            mapped[row.player_id] = mapPlayerRow(row)
          }
          playersCacheRef.current = mapped
          setPlayers(mapped)
        }
        setLoading(false)
      })
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId])

  // ─── Private state subscription ──────────────────────────────
  useEffect(() => {
    if (!gameId || !playerId) return
    let cancelled = false

    const channel = supabase
      .channel(`game-private:${gameId}:${playerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_private_state', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (cancelled) return
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const row = payload.new
            // RLS already filters to own row, but double-check
            if (row.player_id === playerId) {
              setPrivateState(mapPrivateStateRow(row))
            }
          }
        },
      )

    ensureAuth().then(() => {
      if (cancelled) return

      channel.subscribe()

      // Initial fetch
      supabase
        .from('game_private_state')
        .select('*')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .maybeSingle()
        .then(({ data }) => {
          if (!cancelled && data) setPrivateState(mapPrivateStateRow(data))
        })
    })

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId, playerId])

  return { game, players, privateState, loading }
}
