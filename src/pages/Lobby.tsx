import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { startGame } from '../lib/gameService'

export default function Lobby() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()

  // Redirect to game when it starts
  useEffect(() => {
    if (game?.status === 'active' || game?.status === 'ending') {
      navigate(`/game/${gameId}`, { replace: true })
    }
    if (game?.status === 'finished') {
      navigate(`/results/${gameId}`, { replace: true })
    }
  }, [game?.status, gameId, navigate])

  const isHost = user?.uid === game?.hostId
  const playerList = game?.playerOrder.map((pid) => ({
    id: pid,
    ...players[pid],
  })) ?? []

  const handleStart = async () => {
    if (!gameId) return
    try {
      await startGame(gameId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleCopyCode = () => {
    if (game?.joinCode) {
      navigator.clipboard.writeText(game.joinCode)
      toast.success('Code copied!')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-lg mb-4">Game not found</p>
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-amber-300 mb-1">Game Lobby</h1>
          <p className="text-slate-400 text-sm">Waiting for players...</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 shadow-xl">
          {/* Join Code */}
          <div className="text-center mb-6">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Join Code</p>
            <button
              onClick={handleCopyCode}
              className="text-3xl font-mono font-bold text-emerald-400 tracking-[0.3em] hover:text-emerald-300 transition-colors cursor-pointer"
            >
              {game.joinCode}
            </button>
            <p className="text-xs text-slate-500 mt-1">Click to copy</p>
          </div>

          <div className="border-t border-slate-700/50 pt-4 mb-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">
              Players ({playerList.length}/{game.maxPlayers})
            </p>

            <div className="space-y-2">
              {playerList.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 bg-slate-900/40 rounded-lg p-3"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-sm font-bold text-white">
                    {p.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="font-medium text-slate-200">
                    {p.displayName ?? 'Unknown'}
                  </span>
                  {p.id === game.hostId && (
                    <span className="ml-auto text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-full">
                      Host
                    </span>
                  )}
                  {p.id === user?.uid && p.id !== game.hostId && (
                    <span className="ml-auto text-xs bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded-full">
                      You
                    </span>
                  )}
                </motion.div>
              ))}

              {/* Empty seats */}
              {Array.from({ length: game.maxPlayers - playerList.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 bg-slate-900/20 rounded-lg p-3 border border-dashed border-slate-700"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center">
                    <span className="text-slate-500 text-sm">?</span>
                  </div>
                  <span className="text-slate-500 text-sm">Waiting...</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <button
              onClick={handleStart}
              disabled={playerList.length < 2}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg transition-all cursor-pointer"
            >
              {playerList.length < 2 ? 'Need at least 2 players' : 'Start Game'}
            </button>
          )}

          {!isHost && (
            <div className="text-center py-3">
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-slate-400 text-sm"
              >
                Waiting for host to start the game...
              </motion.p>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/')}
          className="block mx-auto mt-4 text-sm text-slate-500 hover:text-slate-300 cursor-pointer"
        >
          Leave Lobby
        </button>
      </motion.div>

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Kamal Hazriq 2026
      </div>
    </div>
  )
}
