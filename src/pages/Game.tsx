import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import {
  drawFromPile,
  takeFromDiscard,
  swapWithSlot,
  discardDrawn,
  useJackPeek,
  callEnd,
  revealHand,
} from '../lib/gameService'
import CardView from '../components/CardView'
import PlayerPanel from '../components/PlayerPanel'
import GameLog from '../components/GameLog'
import DrawnCardModal from '../components/DrawnCardModal'
import PeekModal from '../components/PeekModal'
import PeekResultModal from '../components/PeekResultModal'
import type { Card } from '../lib/types'

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, privateState, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [showPeekSelect, setShowPeekSelect] = useState(false)
  const [peekResult, setPeekResult] = useState<{ card: Card; slot: number } | null>(null)
  const revealedRef = useRef(false)

  // When game becomes finished, reveal own hand then redirect
  useEffect(() => {
    if (game?.status === 'finished' && gameId && user && !revealedRef.current) {
      revealedRef.current = true
      revealHand(gameId)
        .then(() => {
          // Small delay to let other players also reveal
          setTimeout(() => {
            navigate(`/results/${gameId}`, { replace: true })
          }, 1500)
        })
        .catch((e) => {
          console.error('Failed to reveal hand:', e)
          navigate(`/results/${gameId}`, { replace: true })
        })
    }
  }, [game?.status, gameId, user, navigate])

  const isMyTurn = game?.currentTurnPlayerId === user?.uid
  const turnPhase = game?.turnPhase
  const drawnCard = privateState?.drawnCard ?? null
  const isDrawPhase = isMyTurn && turnPhase === 'draw'
  const isActionPhase = isMyTurn && turnPhase === 'action'

  const withBusy = useCallback(async (fn: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [busy])

  const handleDrawPile = () => withBusy(() => drawFromPile(gameId!))
  const handleTakeDiscard = () => withBusy(() => takeFromDiscard(gameId!))

  const handleSwap = (slotIndex: number) => withBusy(() => swapWithSlot(gameId!, slotIndex))
  const handleDiscard = () => withBusy(() => discardDrawn(gameId!))

  const handleUsePower = () => {
    setShowPeekSelect(true)
  }

  const handlePeekSelect = (slotIndex: number) => {
    setShowPeekSelect(false)
    withBusy(async () => {
      const card = await useJackPeek(gameId!, slotIndex)
      setPeekResult({ card, slot: slotIndex })
    })
  }

  const handleCallEnd = () => {
    if (!confirm('Are you sure you want to end the game? All cards will be revealed.')) return
    withBusy(() => callEnd(gameId!))
  }

  if (loading || !game || !user) {
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

  // Show a "revealing" state if game just ended
  if (game.status === 'finished') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p className="text-amber-300 font-medium">Revealing all cards...</p>
        </div>
      </div>
    )
  }

  const otherPlayers = game.playerOrder.filter((pid) => pid !== user.uid)
  const currentTurnName = game.currentTurnPlayerId
    ? players[game.currentTurnPlayerId]?.displayName ?? 'Unknown'
    : null
  const isJack = drawnCard?.rank === 'J' && !drawnCard.isJoker

  return (
    <div className="min-h-screen flex flex-col p-3 md:p-4 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-amber-300">Lucky Seven</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Draw pile: <span className="text-slate-300 font-medium">{game.drawPileCount}</span>
          </span>
          {game.status === 'active' && (
            <button
              onClick={handleCallEnd}
              className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-300 rounded-lg text-xs font-medium transition-colors cursor-pointer"
            >
              End Game
            </button>
          )}
        </div>
      </div>

      {/* Turn indicator */}
      <motion.div
        key={game.currentTurnPlayerId}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`text-center py-2 px-4 rounded-xl mb-4 text-sm font-medium ${
          isMyTurn
            ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-300'
            : 'bg-slate-800/40 border border-slate-700/50 text-slate-400'
        }`}
      >
        {isMyTurn ? (
          isDrawPhase
            ? 'Your turn! Choose where to draw from.'
            : 'Choose: swap with a card or discard.'
        ) : (
          `Waiting for ${currentTurnName} to play...`
        )}
      </motion.div>

      {/* Other players */}
      {otherPlayers.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          {otherPlayers.map((pid) => (
            <PlayerPanel
              key={pid}
              displayName={players[pid]?.displayName ?? 'Unknown'}
              isCurrentTurn={game.currentTurnPlayerId === pid}
              isLocalPlayer={false}
              seatIndex={players[pid]?.seatIndex ?? 0}
              connected={players[pid]?.connected ?? false}
            />
          ))}
        </div>
      )}

      {/* Table area: Draw + Discard */}
      <div className="flex items-center justify-center gap-8 mb-6 py-4">
        {/* Draw pile */}
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-2">Draw Pile</p>
          <CardView
            faceUp={false}
            size="lg"
            onClick={isDrawPhase ? handleDrawPile : undefined}
            disabled={!isDrawPhase || busy}
            highlight={isDrawPhase}
            label={`${game.drawPileCount} left`}
          />
        </div>

        {/* Discard pile */}
        <div className="text-center">
          <p className="text-xs text-slate-500 mb-2">Discard</p>
          {game.discardTop ? (
            <CardView
              card={game.discardTop}
              faceUp
              size="lg"
              onClick={isDrawPhase ? handleTakeDiscard : undefined}
              disabled={!isDrawPhase || busy}
              highlight={isDrawPhase}
            />
          ) : (
            <div className="w-24 h-34 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center">
              <span className="text-slate-600 text-xs">Empty</span>
            </div>
          )}
        </div>
      </div>

      {/* Local player */}
      <div className="mb-4">
        <PlayerPanel
          displayName={players[user.uid]?.displayName ?? 'You'}
          isCurrentTurn={isMyTurn}
          isLocalPlayer
          privateState={privateState}
          seatIndex={players[user.uid]?.seatIndex ?? 0}
          connected
          onSlotClick={isActionPhase ? handleSwap : undefined}
          slotClickable={isActionPhase && !!drawnCard}
        />
      </div>

      {/* Game Log */}
      <GameLog log={game.log} />

      {/* Drawn Card Modal */}
      {isActionPhase && drawnCard && (
        <DrawnCardModal
          card={drawnCard}
          onSwap={handleSwap}
          onDiscard={handleDiscard}
          onUsePower={handleUsePower}
          isJack={isJack}
        />
      )}

      {/* Peek selection modal */}
      <PeekModal
        open={showPeekSelect}
        onSelect={handlePeekSelect}
        onCancel={() => {
          setShowPeekSelect(false)
          handleDiscard()
        }}
      />

      {/* Peek result modal */}
      <PeekResultModal
        card={peekResult?.card ?? null}
        slotIndex={peekResult?.slot ?? null}
        onClose={() => setPeekResult(null)}
      />
    </div>
  )
}
