import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { findGameByCode, joinGame } from '../lib/gameService'

/**
 * /join?code=XXXXXX — auto-join page.
 * Reads the join code from URL search params, waits for auth,
 * then automatically joins the game and redirects to the lobby.
 */
export default function Join() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')?.toUpperCase() ?? ''
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const attempted = useRef(false)

  useEffect(() => {
    if (!code) {
      setError('No join code provided.')
      return
    }
    if (authLoading || !user) return
    if (attempted.current) return
    attempted.current = true

    ;(async () => {
      try {
        const gameId = await findGameByCode(code)
        if (!gameId) {
          setError('Game not found. The code may have expired or be incorrect.')
          return
        }

        // Try to join — if already in the game, joinGame will throw
        // but that's fine — we still navigate to the lobby
        try {
          const storedName = localStorage.getItem('lucky7_playerName') ?? ''
          const name = storedName || `Player ${Math.floor(Math.random() * 900 + 100)}`
          await joinGame(gameId, name)
        } catch (joinErr) {
          const msg = (joinErr as Error).message
          // "Already in game" or "Game is full" — still navigate if already in
          if (!msg.includes('already') && !msg.includes('Already')) {
            setError(msg)
            return
          }
        }

        navigate(`/lobby/${gameId}`, { replace: true })
      } catch (e) {
        const msg = (e as Error).message
        setError(msg)
        toast.error(msg)
      }
    })()
  }, [code, authLoading, user, navigate])

  // No code at all
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

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-400 text-lg mb-2">Failed to join</p>
          <p className="text-slate-400 text-sm mb-4">{error}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => {
                attempted.current = false
                setError(null)
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

  // Loading / joining state
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
          {authLoading ? 'Authenticating...' : `Joining game ${code}...`}
        </p>
      </motion.div>
    </div>
  )
}
