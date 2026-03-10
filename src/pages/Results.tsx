import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { subscribeReveals, revealHand, writeGameSummary, playAgain } from '../lib/gameService'
import CardView from '../components/CardView'
import VersionLabel from '../components/VersionLabel'
import type { PlayerScore } from '../lib/types'

export default function Results() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()
  const [scores, setScores] = useState<PlayerScore[]>([])
  const [playAgainBusy, setPlayAgainBusy] = useState(false)
  const summaryWritten = useRef(false)

  // Subscribe to reveals in real-time (players reveal asynchronously)
  useEffect(() => {
    if (!gameId) return
    const unsub = subscribeReveals(gameId, setScores)
    return unsub
  }, [gameId])

  // Also reveal own hand when landing on results page directly
  useEffect(() => {
    if (gameId && game?.status === 'finished') {
      revealHand(gameId).catch(console.error)
    }
  }, [gameId, game?.status])

  // Write game summary analytics once (host only, one write per game)
  useEffect(() => {
    if (!gameId || !game || !user || summaryWritten.current) return
    if (game.status !== 'finished') return
    if (game.hostId !== user.uid) return // only host writes summary
    if (scores.length < game.playerOrder.length) return // wait for all reveals
    summaryWritten.current = true
    writeGameSummary(gameId, scores, game)
  }, [gameId, game, user, scores])


  if (loading || !game) {
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

  const totalPlayers = game.playerOrder.length
  const allRevealed = scores.length >= totalPlayers

  // Multi-winner tie handling:
  // 1. Find minimum score
  // 2. If tied on score, use most sevens as tiebreaker
  // 3. If still tied, all are winners (shared win)
  const winnerIds = new Set<string>()
  if (allRevealed && scores.length > 0) {
    const minScore = scores[0].total
    const tiedPlayers = scores.filter((s) => s.total === minScore)
    if (tiedPlayers.length === 1) {
      winnerIds.add(tiedPlayers[0].playerId)
    } else {
      const maxSevens = Math.max(...tiedPlayers.map((s) => s.sevens))
      const sevensWinners = tiedPlayers.filter((s) => s.sevens === maxSevens)
      for (const w of sevensWinners) winnerIds.add(w.playerId)
    }
  }
  const isSharedWin = winnerIds.size > 1

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl"
      >
        <div className="text-center mb-6">
          <motion.h1
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="text-4xl font-bold text-amber-300 mb-2"
          >
            Game Over!
          </motion.h1>
          {!allRevealed && (
            <motion.p
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-slate-400 text-sm"
            >
              Waiting for all players to reveal... ({scores.length}/{totalPlayers})
            </motion.p>
          )}
          {allRevealed && isSharedWin && (
            <p className="text-amber-400 text-sm font-medium">
              Shared win! {Array.from(winnerIds).map((id) => {
                const s = scores.find((sc) => sc.playerId === id)
                return s?.displayName ?? 'Unknown'
              }).join(' & ')} tied!
            </p>
          )}
          {allRevealed && game.endCalledBy && (
            <p className="text-slate-400 text-sm">
              Game ended by {players[game.endCalledBy]?.displayName ?? 'a player'}
            </p>
          )}
        </div>

        <div className="space-y-4">
          {scores.map((score, rank) => {
            const isWinner = allRevealed && winnerIds.has(score.playerId)
            const isYou = score.playerId === user?.uid

            return (
              <motion.div
                key={score.playerId}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: rank * 0.15 }}
                className={`
                  rounded-2xl p-4 border
                  ${isWinner
                    ? 'bg-amber-900/30 border-amber-500/50 shadow-lg shadow-amber-500/10'
                    : isYou
                      ? 'bg-amber-900/15 border-amber-500/30'
                      : 'bg-slate-800/40 border-slate-700/50'
                  }
                `}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold
                    ${isWinner
                      ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-amber-900'
                      : 'bg-slate-700 text-slate-400'
                    }
                  `}>
                    {rank + 1}
                  </div>
                  <div>
                    <span className={`font-semibold ${isYou ? 'text-amber-300' : 'text-slate-200'}`}>
                      {score.displayName}
                      {isYou && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold rounded-md align-middle">
                          YOU
                        </span>
                      )}
                    </span>
                    {isWinner && (
                      <span className="block text-xs text-amber-400 font-medium">
                        {isSharedWin ? 'Shared Win!' : 'Winner!'}
                      </span>
                    )}
                  </div>
                  <div className="ml-auto text-right">
                    <span className={`text-2xl font-bold ${isWinner ? 'text-amber-300' : 'text-slate-300'}`}>
                      {score.total}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {score.sevens > 0 ? `${score.sevens} seven${score.sevens > 1 ? 's' : ''}` : 'no sevens'}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 justify-center">
                  {score.hand.map((card, i) => (
                    <CardView key={i} card={card} faceUp size="md" />
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="text-center mt-6 flex items-center justify-center gap-3">
          <button
            onClick={async () => {
              if (playAgainBusy || !gameId) return
              setPlayAgainBusy(true)
              try {
                const myPlayer = players[user?.uid ?? '']
                const myName = myPlayer?.displayName ?? 'Player'
                const myColorKey = myPlayer?.colorKey
                const maxP = game?.maxPlayers ?? 4
                const targetId = await playAgain(gameId, myName, maxP, game?.settings ?? {}, myColorKey)
                navigate(`/lobby/${targetId}`)
              } catch (e) {
                toast.error((e as Error).message)
                setPlayAgainBusy(false)
              }
            }}
            disabled={playAgainBusy}
            className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-white rounded-xl font-semibold transition-all cursor-pointer"
          >
            {playAgainBusy ? 'Joining...' : 'Play Again'}
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-semibold transition-all cursor-pointer"
          >
            Home
          </button>
        </div>
      </motion.div>

      <VersionLabel />

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
