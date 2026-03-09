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
  usePeekOne,
  usePeekAll,
  useSwap,
  useLock,
  useUnlock,
  useRearrange,
  callEnd,
  revealHand,
} from '../lib/gameService'
import CardView from '../components/CardView'
import PlayerPanel from '../components/PlayerPanel'
import GameLog from '../components/GameLog'
import DrawnCardModal from '../components/DrawnCardModal'
import PeekModal from '../components/PeekModal'
import PeekResultModal from '../components/PeekResultModal'
import PeekAllModal from '../components/PeekAllModal'
import QueenSwapModal from '../components/QueenSwapModal'
import SlotPickerModal from '../components/SlotPickerModal'
import JokerChaosModal from '../components/JokerChaosModal'
import type { Card, PowerEffectType, PowerRankKey, PlayerDoc } from '../lib/types'
import { DEFAULT_GAME_SETTINGS } from '../lib/types'

type ModalState =
  | { type: 'none' }
  | { type: 'peekOne' }
  | { type: 'peekResult'; card: Card; slot: number }
  | { type: 'peekAll'; cards: Record<number, Card> }
  | { type: 'swap' }
  | { type: 'lock' }
  | { type: 'unlock' }
  | { type: 'rearrange' }

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, privateState, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const revealedRef = useRef(false)

  // When game becomes finished, reveal own hand then redirect
  useEffect(() => {
    if (game?.status === 'finished' && gameId && user && !revealedRef.current) {
      revealedRef.current = true
      revealHand(gameId)
        .then(() => {
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
  const myPlayer = user ? players[user.uid] : null
  const myLocks = (myPlayer?.locks ?? [false, false, false]) as [boolean, boolean, boolean]
  const powerAssignments = game?.settings?.powerAssignments ?? DEFAULT_GAME_SETTINGS.powerAssignments
  const spentPowerCardIds = game?.spentPowerCardIds ?? {}
  const myKnown = privateState?.known ?? {}

  // Player order with local player first (for modals)
  const modalPlayerOrder = game ? [
    ...(user ? [user.uid] : []),
    ...game.playerOrder.filter((pid) => pid !== user?.uid),
  ] : []

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

  const handleSwap = (slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(() => swapWithSlot(gameId!, slotIndex))
  }

  const handleDiscard = () => {
    setModal({ type: 'none' })
    withBusy(() => discardDrawn(gameId!))
  }

  // ─── Power handlers (route by effectType, not rank) ────
  const handleUsePower = (_rankKey: PowerRankKey, effectType: PowerEffectType) => {
    switch (effectType) {
      case 'peek_all_three_of_your_cards':
        setModal({ type: 'none' })
        withBusy(async () => {
          const cards = await usePeekAll(gameId!)
          setModal({ type: 'peekAll', cards })
        })
        break
      case 'peek_one_of_your_cards':
        setModal({ type: 'peekOne' })
        break
      case 'swap_one_to_one':
        setModal({ type: 'swap' })
        break
      case 'lock_one_card':
        setModal({ type: 'lock' })
        break
      case 'unlock_one_locked_card':
        setModal({ type: 'unlock' })
        break
      case 'rearrange_cards':
        setModal({ type: 'rearrange' })
        break
    }
  }

  const handlePeekSelect = (slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => {
      const card = await usePeekOne(gameId!, slotIndex)
      setModal({ type: 'peekResult', card, slot: slotIndex })
    })
  }

  const handleSwapConfirm = (
    targetA: { playerId: string; slotIndex: number },
    targetB: { playerId: string; slotIndex: number },
  ) => {
    setModal({ type: 'none' })
    withBusy(() => useSwap(gameId!, targetA, targetB))
  }

  const handleLockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(() => useLock(gameId!, targetPlayerId, slotIndex))
  }

  const handleUnlockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(() => useUnlock(gameId!, targetPlayerId, slotIndex))
  }

  const handleRearrangeSelect = (targetPlayerId: string) => {
    setModal({ type: 'none' })
    withBusy(() => useRearrange(gameId!, targetPlayerId))
  }

  const handleCancelPower = () => {
    setModal({ type: 'none' })
    handleDiscard()
  }

  const handleCallEnd = () => {
    if (!confirm(
      'Are you sure? Every other player gets one more turn, then all cards are revealed.'
    )) return
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

  return (
    <div className="min-h-screen flex flex-col p-3 md:p-4 max-w-5xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-amber-300">Lucky Seven</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Draw pile: <span className="text-slate-300 font-medium">{game.drawPileCount}</span>
          </span>
          {game.status === 'ending' && (
            <span className="px-2 py-1 bg-amber-900/40 border border-amber-600/50 text-amber-300 rounded-lg text-xs font-medium animate-pulse">
              Ending Round...
            </span>
          )}
          {/* End button: only visible to the current turn player when game is active */}
          {isMyTurn && game.status === 'active' && (
            <button
              onClick={handleCallEnd}
              disabled={busy}
              className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-300 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
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
            : 'Choose: swap with a card, discard, or use a power.'
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
              playerId={pid}
              displayName={players[pid]?.displayName ?? 'Unknown'}
              isCurrentTurn={game.currentTurnPlayerId === pid}
              isLocalPlayer={false}
              seatIndex={players[pid]?.seatIndex ?? 0}
              connected={players[pid]?.connected ?? false}
              locks={players[pid]?.locks ?? [false, false, false]}
              lockedBy={players[pid]?.lockedBy}
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
          playerId={user.uid}
          displayName={players[user.uid]?.displayName ?? 'You'}
          isCurrentTurn={isMyTurn}
          isLocalPlayer
          privateState={privateState}
          seatIndex={players[user.uid]?.seatIndex ?? 0}
          connected
          locks={myLocks}
          lockedBy={myPlayer?.lockedBy}
          onSlotClick={isActionPhase ? handleSwap : undefined}
          slotClickable={isActionPhase && !!drawnCard}
        />
      </div>

      {/* Game Log */}
      <GameLog log={game.log} />

      {/* ─── Modals ─────────────────────────────────────────── */}

      {/* Drawn Card Modal (main action chooser) */}
      {isActionPhase && drawnCard && modal.type === 'none' && (
        <DrawnCardModal
          card={drawnCard}
          locks={myLocks}
          powerAssignments={powerAssignments}
          spentPowerCardIds={spentPowerCardIds}
          onSwap={handleSwap}
          onDiscard={handleDiscard}
          onUsePower={handleUsePower}
        />
      )}

      {/* Effect: peek_one — slot picker */}
      <PeekModal
        open={modal.type === 'peekOne'}
        onSelect={handlePeekSelect}
        onCancel={handleCancelPower}
      />

      {/* Effect: peek result display */}
      <PeekResultModal
        card={modal.type === 'peekResult' ? modal.card : null}
        slotIndex={modal.type === 'peekResult' ? modal.slot : null}
        onClose={() => setModal({ type: 'none' })}
      />

      {/* Effect: peek_all result display */}
      <PeekAllModal
        open={modal.type === 'peekAll'}
        revealedCards={modal.type === 'peekAll' ? modal.cards : {}}
        locks={myLocks}
        onClose={() => setModal({ type: 'none' })}
      />

      {/* Effect: swap_one_to_one */}
      <QueenSwapModal
        open={modal.type === 'swap'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={user.uid}
        knownCards={myKnown}
        onConfirm={handleSwapConfirm}
        onCancel={handleCancelPower}
      />

      {/* Effect: lock_one_card */}
      <SlotPickerModal
        open={modal.type === 'lock'}
        title="Power: Lock"
        subtitle="Choose an unlocked card to lock. Locked cards cannot be swapped."
        accentColor="red"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={user.uid}
        knownCards={myKnown}
        slotFilter={(_pid: string, slotIndex: number, pd: PlayerDoc) => !pd.locks[slotIndex]}
        onSelect={handleLockSelect}
        onCancel={handleCancelPower}
      />

      {/* Effect: unlock_one_locked_card */}
      <SlotPickerModal
        open={modal.type === 'unlock'}
        title="Power: Unlock"
        subtitle="Choose a locked card to unlock."
        accentColor="cyan"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={user.uid}
        knownCards={myKnown}
        slotFilter={(_pid: string, slotIndex: number, pd: PlayerDoc) => pd.locks[slotIndex]}
        onSelect={handleUnlockSelect}
        onCancel={handleCancelPower}
        noTargetsMessage="No cards are locked."
      />

      {/* Effect: rearrange_cards */}
      <JokerChaosModal
        open={modal.type === 'rearrange'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={user.uid}
        onSelect={handleRearrangeSelect}
        onCancel={handleCancelPower}
      />
    </div>
  )
}
