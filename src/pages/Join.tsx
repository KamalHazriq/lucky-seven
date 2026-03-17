import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { findGameByCode, joinGame } from '../lib/supabaseGameService'
import { LOBBY_COLORS } from '../lib/playerColors'
import { trackEvent } from '../lib/analytics'
import type { PlayerDoc } from '../lib/types'

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }

/**
 * /join?code=XXXXXX — invite link join page.
 * Shows a name + color picker modal BEFORE joining.
 * Validates uniqueness against existing lobby players.
 */
export default function Join() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')?.toUpperCase() ?? ''
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [error, setError] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [resolving, setResolving] = useState(true)
  const resolved = useRef(false)

  // Subscribe to lobby data once we have a gameId (to see taken names/colors)
  const { game, players } = useGame(gameId ?? undefined, undefined)

  // Form state
  const [name, setName] = useState(
    () => localStorage.getItem('lucky7_playerName') ?? '',
  )
  const [selectedColor, setSelectedColor] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  // Step 1: Resolve join code → gameId
  useEffect(() => {
    if (!code) {
      setError('No join code provided.')
      setResolving(false)
      return
    }
    if (authLoading || !user) return
    if (resolved.current) return
    resolved.current = true

    ;(async () => {
      try {
        const id = await findGameByCode(code)
        if (!id) {
          setError('Game not found. The code may have expired or be incorrect.')
          setResolving(false)
          return
        }
        setGameId(id)
        setResolving(false)
      } catch (e) {
        setError((e as Error).message)
        setResolving(false)
      }
    })()
  }, [code, authLoading, user])

  // If user is already in the game, go straight to lobby
  useEffect(() => {
    if (game && user && game.playerOrder.includes(user.uid)) {
      navigate(`/lobby/${gameId}`, { replace: true })
    }
  }, [game, user, gameId, navigate])

  // Build taken names/colors from lobby players
  const existingPlayers = Object.values(players) as PlayerDoc[]
  const takenNames = new Set(existingPlayers.map((p) => p.displayName.toLowerCase()))
  const takenColors = new Map<number, string>()
  existingPlayers.forEach((p) => {
    if (p.colorKey != null) takenColors.set(p.colorKey, p.displayName)
  })

  const nameConflict = name.trim().length > 0 && takenNames.has(name.trim().toLowerCase())
  const lobbyFull = game ? game.playerOrder.length >= game.maxPlayers : false
  const gameStarted = game ? game.status !== 'lobby' : false

  const handleJoin = async () => {
    if (!gameId || !name.trim() || busy) return
    if (nameConflict) return toast.error('Name already taken in this lobby')
    if (selectedColor != null && takenColors.has(selectedColor)) {
      return toast.error('Color already taken')
    }
    if (lobbyFull) return toast.error('Game is full')
    if (gameStarted) return toast.error('Game already started')

    setBusy(true)
    try {
      await joinGame(gameId, name.trim(), selectedColor ?? undefined)
      trackEvent('join_game', { invite_link: true }, gameId)
      localStorage.setItem('lucky7_playerName', name.trim())
      navigate(`/lobby/${gameId}`, { replace: true })
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  // ─── No code ───
  if (!code) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-slate-400 text-lg mb-4">No join code in the link.</p>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  // ─── Error ───
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Failed to join</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                resolved.current = false
                setError(null)
                setResolving(true)
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            >
              Go Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Loading ───
  if (resolving || authLoading || !game) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-slate-300 text-sm">
            {authLoading ? 'Authenticating...' : `Finding game ${code}...`}
          </p>
        </motion.div>
      </div>
    )
  }

  // ─── Name + Color modal ───
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={springEntry}
        className="w-full max-w-sm bg-slate-800/80 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 shadow-2xl"
      >
        <h2 className="text-xl font-bold text-amber-300 mb-1 text-center">Join Game</h2>
        <p className="text-xs text-slate-400 text-center mb-5">
          Room <span className="font-mono font-bold text-emerald-400 tracking-wider">{code}</span>
          {' '}&middot; {game.playerOrder.length}/{game.maxPlayers} players
        </p>

        {lobbyFull ? (
          <div className="text-center py-4">
            <p className="text-red-400 font-medium mb-3">This lobby is full.</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            >
              Go Home
            </button>
          </div>
        ) : gameStarted ? (
          <div className="text-center py-4">
            <p className="text-red-400 font-medium mb-3">This game has already started.</p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            >
              Go Home
            </button>
          </div>
        ) : (
          <>
            {/* Name */}
            <div className="mb-4">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 12))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleJoin() }}
                maxLength={12}
                placeholder="Enter your name"
                className={`w-full px-3 py-2.5 bg-slate-900/80 border rounded-xl text-white text-sm focus:outline-none transition-colors ${
                  nameConflict
                    ? 'border-red-500/60 focus:border-red-500'
                    : 'border-slate-600/60 focus:border-amber-500/60'
                }`}
                autoFocus
              />
              {nameConflict && (
                <p className="text-red-400 text-[11px] mt-1">Name already taken in this lobby</p>
              )}
            </div>

            {/* Color Picker */}
            <div className="mb-5">
              <label className="text-xs text-slate-400 uppercase tracking-wider mb-1.5 block">
                Pick a Color
              </label>
              <div className="grid grid-cols-8 gap-2">
                {LOBBY_COLORS.map((lc, idx) => {
                  const isMine = selectedColor === idx
                  const takenBy = takenColors.get(idx)
                  const isTaken = !!takenBy
                  return (
                    <motion.button
                      key={idx}
                      whileHover={!isTaken ? { scale: 1.2 } : undefined}
                      whileTap={!isTaken ? { scale: 0.85 } : undefined}
                      onClick={() => !isTaken && setSelectedColor(idx)}
                      disabled={isTaken}
                      className={`relative w-8 h-8 rounded-full border-2 transition-all ${
                        isMine
                          ? 'border-white scale-110 ring-2 ring-white/30 cursor-pointer'
                          : isTaken
                            ? 'border-transparent opacity-50 cursor-not-allowed'
                            : 'border-transparent cursor-pointer hover:border-white/30'
                      }`}
                      style={{ backgroundColor: lc.hex }}
                      title={isTaken ? `Taken by ${takenBy}` : lc.name}
                    >
                      {isTaken && (
                        <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs pointer-events-none" style={{ textShadow: '0 0 3px rgba(0,0,0,0.9)' }}>✕</span>
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleJoin}
                disabled={!name.trim() || nameConflict || busy}
                className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm transition-all cursor-pointer"
              >
                {busy ? 'Joining...' : 'Join Game'}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/')}
                className="px-4 py-2.5 bg-slate-700/60 hover:bg-slate-600 text-slate-300 rounded-xl text-sm font-medium cursor-pointer transition-colors"
              >
                Cancel
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
