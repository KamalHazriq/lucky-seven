import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import {
  drawFromPile,
  takeFromDiscard,
  cancelDraw,
  swapWithSlot,
  discardDrawn,
  usePeekOne,
  usePeekAll,
  useSwap,
  useLock,
  useUnlock,
  useRearrange,
  revealHand,
  leaveGame,
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
import SettingsModal from '../components/SettingsModal'
import PowerGuideModal from '../components/PowerGuideModal'
import VersionLabel from '../components/VersionLabel'
import TurnQueue from '../components/TurnQueue'
import { useActionHighlight } from '../hooks/useActionHighlight'
import { useFlyingCard } from '../hooks/useFlyingCard'
import FlyingCard from '../components/FlyingCard'
import StagingSlot from '../components/StagingSlot'
import DiscardFlip from '../components/DiscardFlip'
import ChatPanel from '../components/ChatPanel'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { useChat } from '../hooks/useChat'
import { useChatBubbles } from '../hooks/useChatBubbles'
import { getSeatColor, getPlayerColor } from '../lib/playerColors'
import { useLayout } from '../hooks/useLayout'
import { useUiMode } from '../hooks/useUiMode'
import { useLogPosition } from '../hooks/useLogPosition'
import { getSeatPositions } from '../lib/seatPositions'
import ActionBar from '../components/ActionBar'
import { useSelectionMode } from '../hooks/useSelectionMode'
import type { SelectionConstraint, SelectedTarget } from '../hooks/useSelectionMode'
import { useChoreography } from '../hooks/useChoreography'
import { playSfx, vibrate } from '../lib/sfx'
import { copyToClipboard } from '../lib/share'
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

// ─── Selection constraints for each power ──────────────────
const PEEK_ONE_CONSTRAINT: SelectionConstraint = {
  targetType: 'yourSlot',
  prompt: 'Pick one of your cards to peek',
}
const SWAP_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyPlayerSlot',
  prompt: 'Pick the first card to swap',
  secondTargetType: 'anyPlayerSlot',
  secondPrompt: 'Pick the second card to swap',
}
const LOCK_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyUnlockedSlot',
  prompt: 'Pick an unlocked card to lock',
}
const UNLOCK_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyLockedSlot',
  prompt: 'Pick a locked card to unlock',
}
const REARRANGE_CONSTRAINT: SelectionConstraint = {
  targetType: 'anyPlayer',
  prompt: 'Pick a player to shuffle their cards',
}

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, privateState, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [drawnCardDismissed, setDrawnCardDismissed] = useState(false)
  const [showPowerGuide, setShowPowerGuide] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const revealedRef = useRef(false)
  const { reduced } = useReducedMotion()
  const { layout, toggle: toggleLayout, isMobile } = useLayout()
  const { uiMode, toggleMode: toggleUiMode, isDesktop } = useUiMode()
  const { position: logPosition, toggle: toggleLogPosition, canSidebar: canLogSidebar } = useLogPosition()
  const { flyingCard, triggerFly, queueFly, flushQueue, clearFly } = useFlyingCard()
  const {
    choreo,
    startDiscardTake,
    onStagingArrival,
    startSwapFromStaging,
    onSlotArrival,
    onDiscardArrival,
    startDiscardAction,
    startPileDraw,
    onPlayerArrival,
    reconstructStaging,
    reset: resetChoreo,
  } = useChoreography()
  const drawPileRef = useRef<HTMLDivElement>(null)
  const discardPileRef = useRef<HTMLDivElement>(null)
  const stagingRef = useRef<HTMLDivElement>(null)
  const localPanelRef = useRef<HTMLDivElement>(null)
  const otherPanelRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const headerRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const [, setHeaderH] = useState(0)

  // Selection mode for actionbar power flows
  const {
    selection,
    isSelecting,
    currentTargetType,
    startSelection,
    selectTarget,
    confirm: confirmSelection,
    cancel: cancelSelection,
    goBack: goBackSelection,
  } = useSelectionMode()

  // Stamp overlay state for lock/unlock choreography (Section E)
  const [stampOverlays, setStampOverlays] = useState<Record<string, 'lock' | 'unlock' | null>>({})

  // Remote staging: when another player is in action phase, show a card in staging
  const [remoteStaging, setRemoteStaging] = useState<{ card: Card | null; faceUp: boolean; ownerColor?: string } | null>(null)
  const prevDiscardTopRef = useRef<Card | null>(game?.discardTop ?? null)

  // Temporary peek reveal state (Section F)
  const [peekReveal, setPeekReveal] = useState<{ slot: number; card: Card } | null>(null)
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Measure sticky header + banner stack height for layout offsets.
  // Sets CSS custom properties so the left sidebar and table zone adapt dynamically.
  useEffect(() => {
    const headerEl = headerRef.current
    const bannerEl = bannerRef.current
    if (!headerEl) return
    const update = () => {
      const hH = headerEl.getBoundingClientRect().height
      const bH = bannerEl?.getBoundingClientRect().height ?? 0
      const total = hH + bH
      setHeaderH(total + 8)
      document.documentElement.style.setProperty('--header-h', `${hH}px`)
      document.documentElement.style.setProperty('--top-offset', `${total}px`)
    }
    const ro = new ResizeObserver(update)
    ro.observe(headerEl)
    if (bannerEl) ro.observe(bannerEl)
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--header-h'); document.documentElement.style.removeProperty('--top-offset') }
  }, [])

  // Chat (lazy subscribe — only on first open)
  const chat = useChat(
    gameId,
    players[user?.uid ?? '']?.displayName ?? 'Player',
    players[user?.uid ?? '']?.seatIndex ?? 0,
  )

  // Chat bubbles above player panels (UI-only, auto-clear after 4s)
  const chatBubbles = useChatBubbles(chat.messages, user?.uid ?? '')

  // Queue number map: playerId → queue position (1 = current turn)
  const queueNumbers = (() => {
    const map: Record<string, number> = {}
    if (!game?.currentTurnPlayerId || !game?.playerOrder) return map
    const order = game.playerOrder
    const curIdx = order.indexOf(game.currentTurnPlayerId)
    if (curIdx === -1) return map
    for (let i = 0; i < order.length; i++) {
      const idx = (curIdx + i) % order.length
      map[order[idx]] = i + 1
    }
    return map
  })()

  // Derived state
  const drawnCard = privateState?.drawnCard ?? null
  const hasDrawnCard = !!drawnCard

  // Reset dismissed state when drawn card is consumed/cleared
  useEffect(() => {
    if (!hasDrawnCard) setDrawnCardDismissed(false)
  }, [hasDrawnCard])

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
  const isDrawPhase = isMyTurn && turnPhase === 'draw'
  const isActionPhase = isMyTurn && turnPhase === 'action'
  const myPlayer = user ? players[user.uid] : null
  const myLocks = (myPlayer?.locks ?? [false, false, false]) as [boolean, boolean, boolean]
  const powerAssignments = game?.settings?.powerAssignments ?? DEFAULT_GAME_SETTINGS.powerAssignments
  const spentPowerCardIds = game?.spentPowerCardIds ?? {}
  const myKnown = privateState?.known ?? {}
  // Check if any card is locked anywhere (for disabling unlock power when no targets)
  const hasAnyLocks = Object.values(players).some((p) => p.locks?.some(Boolean))

  // Action highlights (temporary colored ring on actor's panel + per-slot overlays + swap labels)
  const { highlights: actionHighlights, slotOverlays, swapLabels } = useActionHighlight(
    game?.actionVersion ?? 0,
    game?.log ?? [],
    players,
  )

  // Remote player flying card detection
  const prevActionVersion = useRef(game?.actionVersion ?? 0)
  useEffect(() => {
    const av = game?.actionVersion ?? 0
    if (av === prevActionVersion.current || reduced) {
      prevActionVersion.current = av
      return
    }
    prevActionVersion.current = av

    const lastEntry = game?.log?.[game.log.length - 1]
    if (!lastEntry) return

    const msg = lastEntry.msg

    // Find actor from message
    let actorId: string | null = null
    for (const [pid, pd] of Object.entries(players)) {
      if (msg.startsWith(pd.displayName)) {
        actorId = pid
        break
      }
    }

    if (!actorId) return

    const actorColor = getPlayerColor(players[actorId]?.seatIndex ?? 0, players[actorId]?.colorKey).solid

    // Helper: calculate approximate slot position within a panel
    const getSlotRect = (panelEl: HTMLDivElement, slot: number, isLocal: boolean): DOMRect => {
      const panelRect = panelEl.getBoundingClientRect()
      const cardW = isLocal ? 80 : 56
      const cardH = isLocal ? 112 : 80
      const gap = 14
      const totalW = cardW * 3 + gap * 2
      const startX = panelRect.left + (panelRect.width - totalW) / 2
      const cardX = startX + slot * (cardW + gap)
      const cardY = panelRect.top + (isLocal ? panelRect.height * 0.4 : panelRect.height * 0.35)
      return new DOMRect(cardX, cardY, cardW, cardH)
    }

    // Helper: get panel element for a player (local or remote)
    const getPanelEl = (pid: string): HTMLDivElement | null => {
      if (pid === user?.uid) return localPanelRef.current
      return otherPanelRefs.current[pid] ?? null
    }

    // ─── Queen swap: "used X as swap: A's #1 ↔ B's #2" ───
    // Animate for ALL viewers (including local player)
    const queenSwapMatch = msg.match(/as swap:\s*(.+)'s #(\d)\s*↔\s*(.+)'s #(\d)/)
    if (queenSwapMatch) {
      const nameA = queenSwapMatch[1]
      const slotA = parseInt(queenSwapMatch[2], 10) - 1
      const nameB = queenSwapMatch[3]
      const slotB = parseInt(queenSwapMatch[4], 10) - 1

      let pidA: string | null = null
      let pidB: string | null = null
      for (const [pid, pd] of Object.entries(players)) {
        if (pd.displayName === nameA) pidA = pid
        if (pd.displayName === nameB) pidB = pid
      }

      if (pidA && pidB) {
        const panelA = getPanelEl(pidA)
        const panelB = getPanelEl(pidB)
        if (panelA && panelB) {
          const colorA = getPlayerColor(players[pidA]?.seatIndex ?? 0, players[pidA]?.colorKey).solid
          const colorB = getPlayerColor(players[pidB]?.seatIndex ?? 0, players[pidB]?.colorKey).solid
          const rectA = getSlotRect(panelA, slotA, pidA === user?.uid)
          const rectB = getSlotRect(panelB, slotB, pidB === user?.uid)

          // Fly card A → B (with A's color initially)
          triggerFly(rectA, rectB, false, null, colorA)
          // Queue card B → A (with B's color initially)
          queueFly(rectB, rectA, false, null, colorB)
        }
      }
      // Clear remote staging if it was up
      setRemoteStaging(null)
      return
    }

    // ─── Only animate draw/take/discard for remote players ───
    if (actorId === user?.uid) return

    const targetEl = otherPanelRefs.current[actorId]
    if (!targetEl) return

    // Remote draw/take animations fly to staging area (center), not to opponent's panel
    const stagingEl = stagingRef.current
    const stagingRect = stagingEl?.getBoundingClientRect()
    const toRect = stagingRect ?? targetEl.getBoundingClientRect()

    if (msg.includes('drew from the pile')) {
      const fromEl = drawPileRef.current
      if (fromEl) {
        triggerFly(fromEl.getBoundingClientRect(), toRect, false, null, actorColor)
      }
      // Show face-down card tinted with actor's color in staging for remote viewer
      setRemoteStaging({ card: null, faceUp: false, ownerColor: actorColor })
    } else if (msg.includes('took from discard')) {
      const fromEl = discardPileRef.current
      // Use previously tracked discardTop since it's now cleared
      const takenCard = prevDiscardTopRef.current
      if (fromEl) {
        triggerFly(fromEl.getBoundingClientRect(), toRect, true, takenCard, actorColor)
      }
      // Show face-up discard card in staging for remote viewer
      setRemoteStaging({ card: takenCard, faceUp: true, ownerColor: actorColor })
    } else if (msg.includes('discarded') || msg.includes('swapped their card')) {
      // Resolution always routes FROM staging → discard/slot (never from opponent seat directly)
      const fromEl = stagingEl ?? otherPanelRefs.current[actorId]
      if (msg.includes('swapped their card')) {
        // Parse slot index from "swapped their card #N"
        const slotMatch = msg.match(/swapped their card #(\d)/)
        const slotIdx = slotMatch ? parseInt(slotMatch[1]) - 1 : 0

        // Swap: staging → specific slot, then swapped card → discard
        const actorPanel = otherPanelRefs.current[actorId]
        const toEl = discardPileRef.current

        if (fromEl && actorPanel) {
          const slotRect = getSlotRect(actorPanel, slotIdx, false)
          // First fly staging → specific slot
          triggerFly(fromEl.getBoundingClientRect(), slotRect, false, null, actorColor)
        }
        // Then fly swapped card → discard
        if (actorPanel && toEl) {
          const slotRect = getSlotRect(actorPanel, slotIdx, false)
          queueFly(slotRect, toEl.getBoundingClientRect(), true, game?.discardTop ?? null, actorColor)
        }
      } else {
        // Discard: staging → discard pile
        const toEl = discardPileRef.current
        if (fromEl && toEl) {
          triggerFly(fromEl.getBoundingClientRect(), toEl.getBoundingClientRect(), true, game?.discardTop ?? null, actorColor)
        }
      }
      // Clear remote staging when action is resolved
      setRemoteStaging(null)
    }
  }, [game?.actionVersion, game?.log, players, user?.uid, reduced, triggerFly, queueFly, game?.discardTop])

  // Track previous discardTop for remote staging visuals
  useEffect(() => {
    if (game?.discardTop) prevDiscardTopRef.current = game.discardTop
  }, [game?.discardTop])

  // Clear remote staging when turn changes back to draw phase
  useEffect(() => {
    if (game?.turnPhase === 'draw') setRemoteStaging(null)
  }, [game?.turnPhase])

  // Draw pile/discard clickable during draw phase only
  const canDraw = isDrawPhase && !busy
  const canTakeDiscard = canDraw && !!game?.discardTop

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

  const handleDrawPile = () => {
    if (!canDraw) return
    const fromEl = drawPileRef.current
    const stagingEl = stagingRef.current
    withBusy(async () => {
      await drawFromPile(gameId!)
      playSfx('draw'); vibrate()
      if (!reduced && fromEl && stagingEl) {
        // Fly from pile to staging area first (not directly to player panel)
        startPileDraw(fromEl.getBoundingClientRect(), stagingEl.getBoundingClientRect())
      } else {
        // No animation — show in staging immediately (drawnCard comes via Firestore listener)
        reconstructStaging(drawnCard, 'pile')
      }
    })
  }

  const handleTakeDiscard = () => {
    if (!canTakeDiscard) return
    const fromEl = discardPileRef.current
    const stagingEl = stagingRef.current
    const discardCard = game?.discardTop ?? null
    withBusy(async () => {
      await takeFromDiscard(gameId!)
      playSfx('draw'); vibrate()
      if (!reduced && fromEl && stagingEl && discardCard) {
        // Section 2: fly discard card to staging area
        startDiscardTake(discardCard, fromEl.getBoundingClientRect(), stagingEl.getBoundingClientRect())
      }
    })
  }

  const handleCancelDraw = () => {
    const source = privateState?.drawnCardSource
    withBusy(async () => {
      await cancelDraw(gameId!)
      // Clear staging on cancel
      if (source === 'discard') {
        const stagingEl = stagingRef.current
        const discardEl = discardPileRef.current
        if (!reduced && stagingEl && discardEl) {
          startDiscardAction(
            stagingEl.getBoundingClientRect(),
            discardEl.getBoundingClientRect(),
            choreo.staging.card,
            choreo.staging.faceUp,
          )
        } else {
          resetChoreo()
        }
      } else {
        resetChoreo()
      }
    })
  }

  const handleSwap = (slotIndex: number) => {
    setModal({ type: 'none' })
    const stagingEl = stagingRef.current
    const localEl = localPanelRef.current
    const discardEl = discardPileRef.current

    withBusy(async () => {
      await swapWithSlot(gameId!, slotIndex)
      playSfx('swap'); vibrate()

      if (!reduced && choreo.phase === 'staging' && stagingEl && localEl && discardEl) {
        // Section 2: staging → slot, then swapped card → discard (face-down, identity hidden)
        // The DiscardFlip component will reveal the card when discardTop updates
        startSwapFromStaging(
          stagingEl.getBoundingClientRect(),
          localEl.getBoundingClientRect(),
          discardEl.getBoundingClientRect(),
          null, // Don't show card face — it's private until it lands on discard
        )
      } else {
        resetChoreo()
        flushQueue()
      }
    })
  }

  const handleDiscard = () => {
    setModal({ type: 'none' })
    const stagingEl = stagingRef.current
    const localEl = localPanelRef.current
    const discardEl = discardPileRef.current
    withBusy(async () => {
      await discardDrawn(gameId!)
      playSfx('discard')

      if (!reduced && choreo.phase === 'staging' && stagingEl && discardEl) {
        // Section 2: staging card → discard pile
        startDiscardAction(
          stagingEl.getBoundingClientRect(),
          discardEl.getBoundingClientRect(),
          choreo.staging.card,
          choreo.staging.faceUp,
        )
      } else if (!reduced && localEl && discardEl) {
        // Pile draw path: fly from player to discard
        triggerFly(localEl.getBoundingClientRect(), discardEl.getBoundingClientRect(), false)
        flushQueue()
      } else {
        resetChoreo()
        flushQueue()
      }
    })
  }

  // ─── Choreography flight completion handler ─────────────────
  const handleChoreoComplete = useCallback(() => {
    switch (choreo.phase) {
      case 'flyToStaging':
        onStagingArrival()
        break
      case 'flyToSlot':
        onSlotArrival()
        break
      case 'flySwapToDiscard':
        onDiscardArrival()
        break
      case 'flyToPlayer':
        onPlayerArrival()
        break
      case 'flyToDiscard':
        resetChoreo()
        break
    }
  }, [choreo.phase, onStagingArrival, onSlotArrival, onDiscardArrival, onPlayerArrival, resetChoreo])

  // ─── Section 6: Reconstruct staging on resume/refresh ──────
  const hasReconstructedRef = useRef(false)
  useEffect(() => {
    if (hasReconstructedRef.current) return
    if (!isMyTurn || !hasDrawnCard || !privateState) return
    // Only reconstruct if choreography is idle (page just loaded)
    if (choreo.phase !== 'idle') return

    hasReconstructedRef.current = true
    reconstructStaging(drawnCard, privateState.drawnCardSource)
  }, [isMyTurn, hasDrawnCard, privateState, choreo.phase, drawnCard, reconstructStaging])

  // Reset reconstruction flag when drawn card is consumed
  useEffect(() => {
    if (!hasDrawnCard) {
      hasReconstructedRef.current = false
      // Also reset choreography when turn completes
      if (choreo.phase === 'staging') resetChoreo()
    }
  }, [hasDrawnCard, choreo.phase, resetChoreo])

  // ─── Power handlers ────────────────────────────────────────
  // In actionbar mode, powers use selection mode instead of modals
  const handleUsePower = (_rankKey: PowerRankKey, effectType: PowerEffectType) => {
    if (uiMode === 'actionbar') {
      switch (effectType) {
        case 'peek_all_three_of_your_cards':
          // No target selection — execute immediately, show modal
          withBusy(async () => {
            const cards = await usePeekAll(gameId!)
            setModal({ type: 'peekAll', cards })
          })
          break
        case 'peek_one_of_your_cards':
          startSelection(PEEK_ONE_CONSTRAINT)
          break
        case 'swap_one_to_one':
          startSelection(SWAP_CONSTRAINT)
          break
        case 'lock_one_card':
          startSelection(LOCK_CONSTRAINT)
          break
        case 'unlock_one_locked_card':
          startSelection(UNLOCK_CONSTRAINT)
          break
        case 'rearrange_cards':
          startSelection(REARRANGE_CONSTRAINT)
          break
      }
      return
    }

    // Modal mode — original behavior
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

  // ─── Selection mode confirm handler ────────────────────────
  const handleSelectionConfirm = useCallback(() => {
    if (!selection.constraint || selection.phase !== 'confirming') return
    const { targetType } = selection.constraint
    const first = selection.firstTarget
    const second = selection.secondTarget

    if (!first) return

    confirmSelection()

    switch (targetType) {
      case 'yourSlot': {
        // Peek one — Section F: temporary reveal
        withBusy(async () => {
          const card = await usePeekOne(gameId!, first.slotIndex)
          if (reduced) {
            setModal({ type: 'peekResult', card, slot: first.slotIndex })
          } else {
            // Temporary reveal: flip card face-up briefly then flip back
            setPeekReveal({ slot: first.slotIndex, card })
            if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
            peekTimerRef.current = setTimeout(() => {
              setPeekReveal(null)
            }, 1200)
          }
        })
        break
      }
      case 'anyPlayerSlot': {
        // Queen swap
        if (!second) return
        withBusy(async () => {
          await useSwap(gameId!,
            { playerId: first.playerId, slotIndex: first.slotIndex },
            { playerId: second.playerId, slotIndex: second.slotIndex },
          )
          playSfx('swap'); vibrate()
        })
        break
      }
      case 'anyUnlockedSlot': {
        // Lock — Section E: stamp overlay
        withBusy(async () => {
          await useLock(gameId!, first.playerId, first.slotIndex)
          playSfx('lock'); vibrate(50)
          if (!reduced) {
            setStampOverlays((prev) => ({ ...prev, [first.playerId]: 'lock' }))
            setTimeout(() => {
              setStampOverlays((prev) => ({ ...prev, [first.playerId]: null }))
            }, 800)
          }
        })
        break
      }
      case 'anyLockedSlot': {
        // Unlock — Section E: stamp overlay
        withBusy(async () => {
          await useUnlock(gameId!, first.playerId, first.slotIndex)
          playSfx('unlock')
          if (!reduced) {
            setStampOverlays((prev) => ({ ...prev, [first.playerId]: 'unlock' }))
            setTimeout(() => {
              setStampOverlays((prev) => ({ ...prev, [first.playerId]: null }))
            }, 800)
          }
        })
        break
      }
      case 'anyPlayer': {
        // Rearrange/chaos — Section G
        withBusy(async () => {
          await useRearrange(gameId!, first.playerId)
          playSfx('swap'); vibrate(80)
        })
        break
      }
    }
  }, [selection, confirmSelection, withBusy, gameId, reduced])

  // Handle selection target clicks from PlayerPanel
  const handleSelectionClick = useCallback((target: SelectedTarget) => {
    selectTarget(target)
  }, [selectTarget])

  // Handle player-level selection for rearrange
  const handlePlayerSelect = useCallback((playerId: string) => {
    selectTarget({ playerId, slotIndex: 0 })
  }, [selectTarget])

  // ─── Keyboard shortcuts (Section H) ───────────────────────
  useEffect(() => {
    if (!isDesktop || !isMyTurn) return

    const handler = (e: KeyboardEvent) => {
      // Don't capture when chat input or other input is focused
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // During selection mode, Enter to confirm
      if (isSelecting) {
        if (e.key === 'Enter' && selection.phase === 'confirming') {
          e.preventDefault()
          handleSelectionConfirm()
        }
        // Esc is handled by useSelectionMode hook
        return
      }

      // Actionbar mode: 1/2/3 for swap, Esc for cancel
      if (uiMode === 'actionbar' && hasDrawnCard && isActionPhase && modal.type === 'none' && !drawnCardDismissed) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 3) {
          const slotIdx = num - 1
          if (!myLocks[slotIdx]) {
            e.preventDefault()
            handleSwap(slotIdx)
          }
        }
        if (e.key === 'Escape') {
          if (privateState?.drawnCardSource === 'discard') {
            e.preventDefault()
            handleCancelDraw()
          }
        }
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    isDesktop, isMyTurn, isSelecting, selection.phase, uiMode,
    hasDrawnCard, isActionPhase, modal.type, drawnCardDismissed,
    myLocks, handleSelectionConfirm, privateState?.drawnCardSource,
  ])

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
    withBusy(async () => { await useLock(gameId!, targetPlayerId, slotIndex); playSfx('lock'); vibrate(50) })
  }

  const handleUnlockSelect = (targetPlayerId: string, slotIndex: number) => {
    setModal({ type: 'none' })
    withBusy(async () => { await useUnlock(gameId!, targetPlayerId, slotIndex); playSfx('unlock') })
  }

  const handleRearrangeSelect = (targetPlayerId: string) => {
    setModal({ type: 'none' })
    withBusy(async () => { await useRearrange(gameId!, targetPlayerId); playSfx('swap'); vibrate(80) })
  }

  const handleCancelPower = () => {
    setModal({ type: 'none' })
  }

  // Clean up peek timer on unmount
  useEffect(() => {
    return () => {
      if (peekTimerRef.current) clearTimeout(peekTimerRef.current)
    }
  }, [])

  if (loading || !game || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (game.status === 'finished') {
    return (
      <div className="min-h-dvh flex items-center justify-center">
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

  // Selection mode props — passed to all PlayerPanels
  const selectionProps = isSelecting ? {
    selectionTargetType: currentTargetType,
    localPlayerId: user.uid,
    players,
    onSelectionClick: handleSelectionClick,
    onPlayerSelect: handlePlayerSelect,
    selectedTarget: selection.firstTarget,
  } : {}

  return (
    <div className={`min-h-dvh flex flex-col ${logPosition === 'left' ? '' : 'max-w-5xl mx-auto'}`}>
      {/* ─── Sticky Top Bar (v1.5 — 3-zone layout) ──────────── */}
      <div
        ref={headerRef}
        className="sticky top-0 z-50 w-full backdrop-blur-md border-b"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'color-mix(in srgb, var(--surface-solid) 85%, transparent)',
          borderColor: 'var(--border-solid)',
        }}
      >
        <div className="flex items-center px-3 md:px-5 py-1.5 min-h-[48px] max-w-5xl mx-auto gap-2">
          {/* ── LEFT: Title + Room Code + Pile ── */}
          <div className="flex items-center gap-2 shrink-0 min-w-0">
            <h1 className="text-base font-bold text-amber-300 leading-none whitespace-nowrap hidden sm:block">Lucky Seven™</h1>
            <h1 className="text-base font-bold text-amber-300 leading-none whitespace-nowrap sm:hidden">L7</h1>
            <button
              onClick={() => { copyToClipboard(game.joinCode); toast.success('Room code copied!') }}
              className="group relative flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-800/60 border border-slate-700/40 hover:bg-slate-700/60 transition-colors cursor-pointer"
              aria-label={`Copy room code ${game.joinCode}`}
              title="Click to copy room code"
            >
              <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400">{game.joinCode}</span>
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="toolbar-tooltip">Copy Code</span>
            </button>
            <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--text-dim)' }}>
              {game.drawPileCount} left
            </span>
            {game.drawPileCount <= 3 && game.drawPileCount > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-900/40 border border-amber-600/50 text-amber-300 rounded-md text-[9px] font-bold animate-pulse whitespace-nowrap">
                FINAL
              </span>
            )}
            {game.drawPileCount === 0 && (
              <span className="px-1.5 py-0.5 bg-red-900/40 border border-red-600/50 text-red-300 rounded-md text-[9px] font-bold animate-pulse whitespace-nowrap">
                LAST TURN
              </span>
            )}
          </div>

          {/* ── CENTER: Turn strip (hidden on very small screens) ── */}
          <div className="flex-1 min-w-0 hidden md:flex justify-center">
            <TurnQueue
              playerOrder={game.playerOrder}
              players={players}
              currentTurnPlayerId={game.currentTurnPlayerId}
              localPlayerId={user.uid}
              compact
            />
          </div>

          {/* ── RIGHT: Clean icon cluster ── */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Settings — opens modal with all options */}
            <motion.button
              whileHover={{ scale: 1.08, rotate: 45 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={() => setShowSettings(true)}
              className="topbar-btn group relative"
              aria-label="Open settings"
            >
              {'\u2699\uFE0F'}
              <span className="toolbar-tooltip">Settings</span>
            </motion.button>

            {/* Help / Power Guide */}
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={() => setShowPowerGuide(true)}
              className="topbar-btn group relative bg-amber-900/30 border-amber-600/40 text-amber-400 hover:bg-amber-900/50"
              aria-label="Power guide — view card power instructions"
            >
              ?
              <span className="toolbar-tooltip">Powers</span>
            </motion.button>

            {/* Chat */}
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={chat.toggleChat}
              className="topbar-btn group relative bg-indigo-900/30 border-indigo-600/40 text-indigo-400 hover:bg-indigo-900/50"
              aria-label="Open chat"
            >
              {'\u{1F4AC}'}
              {chat.unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
                >
                  {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
                </motion.span>
              )}
              <span className="toolbar-tooltip">Chat</span>
            </motion.button>

            {/* End Game button removed — game ends automatically when draw pile is exhausted */}
          </div>
        </div>
      </div>

      {/* ─── Safe Layout Stack: banners push content down ────── */}
      <div ref={bannerRef} className="safe-layout-stack flex flex-col">
        {/* Resume banner removed — drawn card now shown in staging slot with "Resolve" chip */}

        {/* Selection mode prompt banner */}
        {isSelecting && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.5 }}
            className="px-3 md:px-5 pt-2"
          >
            <div className="py-2 px-4 bg-amber-900/30 border border-amber-600/40 rounded-xl text-amber-300 text-xs font-semibold text-center">
              {selection.phase === 'choosingTarget' && selection.constraint?.prompt}
              {selection.phase === 'choosingSecondTarget' && selection.constraint?.secondPrompt}
              {selection.phase === 'confirming' && 'Ready to confirm — check the Action Bar below'}
            </div>
          </motion.div>
        )}
      </div>

      {/* ─── Main Content ─────────────────────────────────────── */}
      <div className={`flex-1 ${logPosition === 'left' ? 'flex' : 'flex flex-col p-3 md:p-4'}`}>

        {/* Left sidebar log — matches table zone height, scrolls internally */}
        {logPosition === 'left' && (
          <aside
            className="shrink-0 w-56 min-h-0 sticky self-start overflow-y-auto border-r pt-1 px-2"
            style={{
              top: 'var(--top-offset, 56px)',
              height: 'calc(100dvh - var(--top-offset, 56px) - 2rem)',
              maxHeight: 'min(800px, calc(100dvh - var(--top-offset, 56px) - 2rem))',
              borderColor: 'var(--border)',
            }}
          >
            <GameLog log={game.log} players={players} position="left" />
          </aside>
        )}

        <div className={`${logPosition === 'left' ? 'flex-1 min-w-0 flex flex-col max-w-5xl mx-auto p-3 md:p-4 w-full' : 'contents'}`}>

        {/* Turn queue — mobile only (desktop shows in top bar) */}
        <div className="md:hidden">
          <TurnQueue
            playerOrder={game.playerOrder}
            players={players}
            currentTurnPlayerId={game.currentTurnPlayerId}
            localPlayerId={user.uid}
          />
        </div>

        {/* Turn indicator */}
        <motion.div
          key={game.currentTurnPlayerId}
          initial={{ opacity: 0, y: -8, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.6 }}
          className={`text-center py-1.5 px-4 rounded-xl mb-3 text-xs font-medium ${
            isMyTurn
              ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-300'
              : 'bg-slate-800/40 border border-slate-700/50 text-slate-400'
          }`}
        >
          {isMyTurn ? (
            isDrawPhase
              ? 'Your turn — draw from the pile or discard'
              : 'Swap, discard, or use a power'
          ) : (
            `Waiting for ${currentTurnName}...`
          )}
        </motion.div>

        {layout === 'table' ? (
          /* ─── TABLE LAYOUT ─── Poker-table circular arrangement ─── */
          (() => {
            const seatPositions = getSeatPositions(otherPlayers.length)
            const panelW = otherPlayers.length <= 3 ? '200px' : otherPlayers.length <= 5 ? '175px' : '155px'
            return (
              <>
              <div
                className="table-zone relative w-full mb-4 pt-2"
                style={{
                  /* Fill remaining viewport below header+banners, clamped for sanity */
                  minHeight: 'max(400px, calc(100dvh - var(--top-offset, 56px) - 6rem))',
                  maxHeight: 'min(800px, calc(100dvh - var(--top-offset, 56px) - 2rem))',
                }}
              >
                {/* Table surface — oval felt gradient */}
                <div
                  className="absolute rounded-[50%] pointer-events-none"
                  style={{
                    left: '5%', right: '5%', top: '3%', bottom: '6%',
                    background: 'radial-gradient(ellipse at center, rgba(15,76,46,0.35) 0%, rgba(15,76,46,0.18) 40%, rgba(15,76,46,0.05) 70%, transparent 100%)',
                    border: '2px solid rgba(15,76,46,0.22)',
                    boxShadow: 'inset 0 0 80px rgba(15,76,46,0.12), inset 0 0 20px rgba(15,76,46,0.08)',
                  }}
                />

                {/* Center: Draw + Staging + Discard piles */}
                <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2 flex items-center gap-4 z-10">
                  <div className="text-center" ref={drawPileRef}>
                    <p className="text-[10px] text-slate-500 mb-1">Draw</p>
                    <CardView
                      faceUp={false}
                      size="md"
                      onClick={canDraw ? handleDrawPile : undefined}
                      disabled={!canDraw}
                      highlight={canDraw}
                      label={`${game.drawPileCount}`}
                    />
                  </div>
                  {/* Staging slot — shows local choreo or remote staging */}
                  {(() => {
                    // For local pile draws, show the actual drawn card face-up in staging
                    const isLocalPileStaging = choreo.phase === 'staging' && choreo.staging.source === 'pile' && drawnCard
                    const stagingCard = isLocalPileStaging ? drawnCard : (choreo.phase === 'staging' ? choreo.staging.card : remoteStaging?.card ?? null)
                    const stagingFaceUp = isLocalPileStaging ? true : (choreo.phase === 'staging' ? choreo.staging.faceUp : remoteStaging?.faceUp ?? false)
                    return (
                      <StagingSlot
                        ref={stagingRef}
                        card={stagingCard}
                        faceUp={stagingFaceUp}
                        active={choreo.phase === 'staging' || !!remoteStaging}
                        ownerColor={remoteStaging?.ownerColor}
                        onResolve={hasDrawnCard && isMyTurn && (drawnCardDismissed || modal.type !== 'none') && !isSelecting
                          ? () => { setModal({ type: 'none' }); setDrawnCardDismissed(false) }
                          : undefined}
                      />
                    )
                  })()}
                  <div className="text-center relative" ref={discardPileRef}>
                    <p className="text-[10px] text-slate-500 mb-1">Discard</p>
                    {game.discardTop ? (
                      <div className="relative">
                        <CardView
                          card={game.discardTop}
                          faceUp
                          size="md"
                          onClick={canTakeDiscard ? handleTakeDiscard : undefined}
                          disabled={!canTakeDiscard}
                          highlight={canTakeDiscard}
                        />
                        {/* Section 5: Discard flip overlay */}
                        <DiscardFlip discardTop={game.discardTop} reduced={reduced} />
                      </div>
                    ) : (
                      <div className="w-20 h-28 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center" title="Discard is empty">
                        <span className="text-slate-600 text-[10px]">Empty</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Other players arranged around the table */}
                {otherPlayers.map((pid, idx) => {
                  const pos = seatPositions[idx]
                  return (
                    <div
                      key={pid}
                      ref={(el) => { otherPanelRefs.current[pid] = el }}
                      className="absolute z-10"
                      style={{
                        left: `${pos.left}%`,
                        top: `${pos.top}%`,
                        transform: 'translate(-50%, -50%)',
                        maxWidth: panelW,
                        width: otherPlayers.length <= 4 ? '42%' : '36%',
                        overflow: 'visible',
                      }}
                    >
                      <PlayerPanel
                        playerId={pid}
                        displayName={players[pid]?.displayName ?? 'Unknown'}
                        isCurrentTurn={game.currentTurnPlayerId === pid}
                        isLocalPlayer={false}
                        seatIndex={players[pid]?.seatIndex ?? 0}
                        colorKey={players[pid]?.colorKey}
                        connected={players[pid]?.connected ?? false}
                        locks={players[pid]?.locks ?? [false, false, false]}
                        lockedBy={players[pid]?.lockedBy}
                        actionHighlight={actionHighlights[pid] ?? null}
                        chatBubble={chatBubbles[pid] ?? null}
                        queueNumber={queueNumbers[pid] ?? null}
                        slotOverlays={slotOverlays[pid] ?? null}
                        swapLabels={swapLabels[pid] ?? null}
                        stampOverlay={stampOverlays[pid] ?? null}
                        {...selectionProps}
                      />
                    </div>
                  )
                })}

                {/* Local player at bottom center */}
                <div
                  className="absolute left-1/2 z-10"
                  ref={localPanelRef}
                  style={{ bottom: '4px', transform: 'translateX(-50%)', maxWidth: '340px', width: '85%' }}
                >
                  <PlayerPanel
                    playerId={user.uid}
                    displayName={players[user.uid]?.displayName ?? 'You'}
                    isCurrentTurn={isMyTurn}
                    isLocalPlayer
                    privateState={peekReveal ? {
                      ...privateState!,
                      known: { ...myKnown, [String(peekReveal.slot)]: peekReveal.card },
                    } : privateState}
                    seatIndex={players[user.uid]?.seatIndex ?? 0}
                    colorKey={players[user.uid]?.colorKey}
                    connected
                    locks={myLocks}
                    lockedBy={myPlayer?.lockedBy}
                    onSlotClick={isActionPhase ? handleSwap : undefined}
                    slotClickable={isActionPhase && hasDrawnCard && modal.type === 'none' && !isSelecting}
                    actionHighlight={actionHighlights[user.uid] ?? null}
                    queueNumber={queueNumbers[user.uid] ?? null}
                    slotOverlays={slotOverlays[user.uid] ?? null}
                    swapLabels={swapLabels[user.uid] ?? null}
                    stampOverlay={stampOverlays[user.uid] ?? null}
                    {...selectionProps}
                  />
                </div>
              </div>
              {/* Action Bar for table layout — below table zone */}
              {uiMode === 'actionbar' && (
                <div className="mx-auto mb-4" style={{ maxWidth: '380px', width: '90%' }}>
                  <ActionBar
                    card={isMyTurn && hasDrawnCard ? drawnCard : null}
                    visible={modal.type === 'none' && !drawnCardDismissed}
                    locks={myLocks}
                    powerAssignments={powerAssignments}
                    spentPowerCardIds={spentPowerCardIds}
                    drawnCardSource={privateState?.drawnCardSource ?? null}
                    onSwap={handleSwap}
                    onDiscard={handleDiscard}
                    onUsePower={handleUsePower}
                    onClose={handleCancelDraw}
                    selection={selection}
                    onSelectionConfirm={handleSelectionConfirm}
                    onSelectionCancel={cancelSelection}
                    onSelectionGoBack={goBackSelection}
                    isDesktop={isDesktop}
                    players={players}
                    hasAnyLocks={hasAnyLocks}
                  />
                </div>
              )}
              </>
            )
          })()
        ) : (
          /* ─── CLASSIC LAYOUT ─── Original grid layout ─── */
          <>
            {/* Other players */}
            {otherPlayers.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                {otherPlayers.map((pid) => (
                  <div
                    key={pid}
                    ref={(el) => { otherPanelRefs.current[pid] = el }}
                  >
                    <PlayerPanel
                      playerId={pid}
                      displayName={players[pid]?.displayName ?? 'Unknown'}
                      isCurrentTurn={game.currentTurnPlayerId === pid}
                      isLocalPlayer={false}
                      seatIndex={players[pid]?.seatIndex ?? 0}
                      connected={players[pid]?.connected ?? false}
                      locks={players[pid]?.locks ?? [false, false, false]}
                      lockedBy={players[pid]?.lockedBy}
                      actionHighlight={actionHighlights[pid] ?? null}
                      chatBubble={chatBubbles[pid] ?? null}
                      queueNumber={queueNumbers[pid] ?? null}
                      slotOverlays={slotOverlays[pid] ?? null}
                      swapLabels={swapLabels[pid] ?? null}
                      stampOverlay={stampOverlays[pid] ?? null}
                      {...selectionProps}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Table area: Draw + Staging + Discard */}
            <div className="flex items-center justify-center gap-6 mb-4 py-3">
              <div className="text-center" ref={drawPileRef}>
                <p className="text-xs text-slate-500 mb-2">Draw Pile</p>
                <CardView
                  faceUp={false}
                  size="lg"
                  onClick={canDraw ? handleDrawPile : undefined}
                  disabled={!canDraw}
                  highlight={canDraw}
                  label={`${game.drawPileCount} left`}
                />
              </div>

              {/* Staging slot — shows local choreo or remote staging */}
              {(() => {
                const isLocalPileStaging = choreo.phase === 'staging' && choreo.staging.source === 'pile' && drawnCard
                const stagingCard = isLocalPileStaging ? drawnCard : (choreo.phase === 'staging' ? choreo.staging.card : remoteStaging?.card ?? null)
                const stagingFaceUp = isLocalPileStaging ? true : (choreo.phase === 'staging' ? choreo.staging.faceUp : remoteStaging?.faceUp ?? false)
                return (
                  <StagingSlot
                    ref={stagingRef}
                    card={stagingCard}
                    faceUp={stagingFaceUp}
                    active={choreo.phase === 'staging' || !!remoteStaging}
                    onResolve={hasDrawnCard && isMyTurn && (drawnCardDismissed || modal.type !== 'none') && !isSelecting
                      ? () => { setModal({ type: 'none' }); setDrawnCardDismissed(false) }
                      : undefined}
                  />
                )
              })()}

              <div className="text-center relative" ref={discardPileRef}>
                <p className="text-xs text-slate-500 mb-2">Discard</p>
                {game.discardTop ? (
                  <div className="relative">
                    <CardView
                      card={game.discardTop}
                      faceUp
                      size="lg"
                      onClick={canTakeDiscard ? handleTakeDiscard : undefined}
                      disabled={!canTakeDiscard}
                      highlight={canTakeDiscard}
                    />
                    {/* Section 5: Discard flip overlay */}
                    <DiscardFlip discardTop={game.discardTop} reduced={reduced} />
                  </div>
                ) : (
                  <div className="w-24 h-34 rounded-xl border-2 border-dashed border-slate-700 flex items-center justify-center" title="Discard is empty">
                    <span className="text-slate-600 text-xs">Empty</span>
                  </div>
                )}
              </div>
            </div>

            {/* Local player */}
            <div className="mb-4" ref={localPanelRef}>
              <PlayerPanel
                playerId={user.uid}
                displayName={players[user.uid]?.displayName ?? 'You'}
                isCurrentTurn={isMyTurn}
                isLocalPlayer
                privateState={peekReveal ? {
                  ...privateState!,
                  known: { ...myKnown, [String(peekReveal.slot)]: peekReveal.card },
                } : privateState}
                seatIndex={players[user.uid]?.seatIndex ?? 0}
                connected
                locks={myLocks}
                lockedBy={myPlayer?.lockedBy}
                onSlotClick={isActionPhase ? handleSwap : undefined}
                slotClickable={isActionPhase && hasDrawnCard && modal.type === 'none' && !isSelecting}
                actionHighlight={actionHighlights[user.uid] ?? null}
                queueNumber={queueNumbers[user.uid] ?? null}
                slotOverlays={slotOverlays[user.uid] ?? null}
                swapLabels={swapLabels[user.uid] ?? null}
                stampOverlay={stampOverlays[user.uid] ?? null}
                {...selectionProps}
              />
              {/* Action Bar — inline alternative to drawn card modal */}
              {uiMode === 'actionbar' && (
                <ActionBar
                  card={isMyTurn && hasDrawnCard ? drawnCard : null}
                  visible={modal.type === 'none' && !drawnCardDismissed}
                  locks={myLocks}
                  powerAssignments={powerAssignments}
                  spentPowerCardIds={spentPowerCardIds}
                  drawnCardSource={privateState?.drawnCardSource ?? null}
                  onSwap={handleSwap}
                  onDiscard={handleDiscard}
                  onUsePower={handleUsePower}
                  onClose={handleCancelDraw}
                  selection={selection}
                  onSelectionConfirm={handleSelectionConfirm}
                  onSelectionCancel={cancelSelection}
                  onSelectionGoBack={goBackSelection}
                  isDesktop={isDesktop}
                  players={players}
                  hasAnyLocks={hasAnyLocks}
                />
              )}
            </div>
          </>
        )}

        {/* Game Log — bottom position (default) */}
        {logPosition === 'bottom' && (
          <GameLog log={game.log} players={players} position="bottom" />
        )}

        </div>{/* end of content wrapper for left-log layout */}
      </div>

      {/* ─── Modals ─────────────────────────────────────────── */}

      {/* Drawn Card Modal (main action chooser) — only in modal UI mode */}
      <DrawnCardModal
        card={uiMode === 'modal' && isMyTurn && hasDrawnCard ? drawnCard : null}
        open={modal.type === 'none' && !drawnCardDismissed}
        locks={myLocks}
        powerAssignments={powerAssignments}
        spentPowerCardIds={spentPowerCardIds}
        knownCards={myKnown}
        drawnCardSource={privateState?.drawnCardSource ?? null}
        onSwap={handleSwap}
        onDiscard={handleDiscard}
        onUsePower={handleUsePower}
        onClose={handleCancelDraw}
        onDismiss={() => setDrawnCardDismissed(true)}
        hasAnyLocks={hasAnyLocks}
      />

      <PeekModal
        open={modal.type === 'peekOne'}
        onSelect={handlePeekSelect}
        onCancel={handleCancelPower}
      />

      <PeekResultModal
        card={modal.type === 'peekResult' ? modal.card : null}
        slotIndex={modal.type === 'peekResult' ? modal.slot : null}
        onClose={() => setModal({ type: 'none' })}
      />

      <PeekAllModal
        open={modal.type === 'peekAll'}
        revealedCards={modal.type === 'peekAll' ? modal.cards : {}}
        locks={myLocks}
        onClose={() => setModal({ type: 'none' })}
      />

      <QueenSwapModal
        open={modal.type === 'swap'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={user.uid}
        knownCards={myKnown}
        onConfirm={handleSwapConfirm}
        onCancel={handleCancelPower}
      />

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

      <JokerChaosModal
        open={modal.type === 'rearrange'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={user.uid}
        onSelect={handleRearrangeSelect}
        onCancel={handleCancelPower}
      />

      <PowerGuideModal
        open={showPowerGuide}
        onClose={() => setShowPowerGuide(false)}
        powerAssignments={powerAssignments}
      />

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        layout={layout}
        onToggleLayout={toggleLayout}
        uiMode={uiMode}
        onToggleUiMode={toggleUiMode}
        logPosition={logPosition}
        onToggleLogPosition={toggleLogPosition}
        showLayoutToggle={!isMobile}
        showUiModeToggle={!isMobile}
        showLogToggle={canLogSidebar}
        onLeaveGame={async () => {
          if (!confirm('Are you sure you want to leave? You cannot rejoin this game.')) return
          setShowSettings(false)
          // Clean up any active selection/choreography state
          if (isSelecting) cancelSelection()
          resetChoreo()
          try {
            await leaveGame(gameId!)
          } catch (e) {
            console.error('Failed to leave game:', e)
          }
          navigate('/')
        }}
      />

      {/* Legacy flying card (remote player animations) */}
      {flyingCard.active && flyingCard.from && flyingCard.to && (
        <FlyingCard
          from={flyingCard.from}
          to={flyingCard.to}
          faceUp={flyingCard.faceUp}
          card={flyingCard.card}
          ownerColor={flyingCard.ownerColor}
          onComplete={clearFly}
          reduced={reduced}
        />
      )}

      {/* Choreography flying card (local player multi-step animations) */}
      {choreo.phase !== 'idle' && choreo.phase !== 'staging' && choreo.flyFrom && choreo.flyTo && (
        <FlyingCard
          from={choreo.flyFrom}
          to={choreo.flyTo}
          faceUp={choreo.flyFaceUp}
          card={choreo.flyCard}
          ownerColor={choreo.flyOwnerColor}
          onComplete={handleChoreoComplete}
          reduced={reduced}
          duration={
            choreo.phase === 'flyToStaging' ? 1.5
              : choreo.phase === 'flyToPlayer' ? 1.4
              : choreo.phase === 'flySwapToDiscard' ? 1.6
              : choreo.phase === 'flyToSlot' ? 1.5
              : 1.7
          }
        />
      )}

      <ChatPanel
        open={chat.isOpen}
        messages={chat.messages}
        localUserId={user.uid}
        onSend={chat.send}
        onClose={chat.closeChat}
      />

      <VersionLabel />

      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
