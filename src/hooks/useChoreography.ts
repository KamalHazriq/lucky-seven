import { useState, useCallback, useRef } from 'react'
import type { Card } from '../lib/types'

/**
 * Choreography phases for card animations.
 *
 * Discard take flow:
 *   idle → flyToStaging → staging → flyToSlot (+ flySwapToDiscard) → idle
 *
 * Draw pile flow:
 *   idle → flyToPlayer → idle  (no staging for pile draws)
 *
 * Discard flow (action phase):
 *   idle → flyToDiscard → idle
 */
export type ChoreographyPhase =
  | 'idle'
  | 'flyToStaging'     // Card flying from discard pile to staging area
  | 'staging'          // Card sitting in staging area, waiting for player action
  | 'flyToSlot'        // Card flying from staging to chosen slot
  | 'flySwapToDiscard' // Swapped-out card flying from slot to discard
  | 'flyToPlayer'      // Face-down card flying from pile to local panel
  | 'flyToDiscard'     // Card flying from player to discard pile

export interface StagingState {
  /** The card sitting in the staging area (public for discard takes) */
  card: Card | null
  /** Source of the staged card */
  source: 'discard' | 'pile' | null
  /** Whether the staging card is face-up (discard takes = yes, pile draws = no) */
  faceUp: boolean
}

export interface ChoreographyState {
  phase: ChoreographyPhase
  staging: StagingState
  /** Flying card animation params for current phase */
  flyFrom: DOMRect | null
  flyTo: DOMRect | null
  flyFaceUp: boolean
  flyCard: Card | null
  flyOwnerColor?: string
}

const INITIAL_STAGING: StagingState = { card: null, source: null, faceUp: false }

const INITIAL: ChoreographyState = {
  phase: 'idle',
  staging: INITIAL_STAGING,
  flyFrom: null,
  flyTo: null,
  flyFaceUp: false,
  flyCard: null,
  flyOwnerColor: undefined,
}

/**
 * useChoreography — manages multi-step animation sequences for
 * the card draw/discard/swap flow. Purely visual, no Firestore writes.
 *
 * v1.4.2: Staging area choreography for discard takes.
 */
export function useChoreography() {
  const [state, setState] = useState<ChoreographyState>(INITIAL)
  const pendingRef = useRef<{
    slotRect?: DOMRect
    discardRect?: DOMRect
    swapCard?: Card | null
    ownerColor?: string
  }>({})

  /** Start discard take: fly card from discard pile to staging area */
  const startDiscardTake = useCallback((
    discardCard: Card,
    fromRect: DOMRect,
    stagingRect: DOMRect,
  ) => {
    setState({
      phase: 'flyToStaging',
      staging: { card: discardCard, source: 'discard', faceUp: true },
      flyFrom: fromRect,
      flyTo: stagingRect,
      flyFaceUp: true,
      flyCard: discardCard,
      flyOwnerColor: undefined,
    })
  }, [])

  /** When flyToStaging completes, enter staging phase */
  const onStagingArrival = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: 'staging',
      flyFrom: null,
      flyTo: null,
    }))
  }, [])

  /** Start swap from staging: fly card from staging to slot */
  const startSwapFromStaging = useCallback((
    stagingRect: DOMRect,
    slotRect: DOMRect,
    discardRect: DOMRect,
    swapCard: Card | null,
    ownerColor?: string,
  ) => {
    // Store pending data for the second animation (swap card → discard)
    pendingRef.current = { slotRect, discardRect, swapCard, ownerColor }
    setState((prev) => ({
      ...prev,
      phase: 'flyToSlot',
      flyFrom: stagingRect,
      flyTo: slotRect,
      flyFaceUp: prev.staging.faceUp,
      flyCard: prev.staging.card,
    }))
  }, [])

  /** When flyToSlot completes, start the swap card flying to discard */
  const onSlotArrival = useCallback(() => {
    const { slotRect, discardRect, swapCard } = pendingRef.current
    if (slotRect && discardRect) {
      setState((prev) => ({
        ...prev,
        phase: 'flySwapToDiscard',
        staging: INITIAL_STAGING,
        flyFrom: slotRect,
        flyTo: discardRect,
        flyFaceUp: true,
        flyCard: swapCard ?? null,
        flyOwnerColor: undefined,
      }))
      pendingRef.current = {}
    } else {
      // No swap card to animate — done
      setState(INITIAL)
      pendingRef.current = {}
    }
  }, [])

  /** When swap card arrives at discard, complete the choreography */
  const onDiscardArrival = useCallback(() => {
    setState(INITIAL)
  }, [])

  /** Start discard action: fly card from staging/player to discard */
  const startDiscardAction = useCallback((
    fromRect: DOMRect,
    toRect: DOMRect,
    card: Card | null,
    faceUp: boolean,
  ) => {
    setState({
      phase: 'flyToDiscard',
      staging: INITIAL_STAGING,
      flyFrom: fromRect,
      flyTo: toRect,
      flyFaceUp: faceUp,
      flyCard: card,
      flyOwnerColor: undefined,
    })
  }, [])

  /** Start pile draw: fly face-down card from pile to player panel */
  const startPileDraw = useCallback((
    fromRect: DOMRect,
    toRect: DOMRect,
    ownerColor?: string,
  ) => {
    setState({
      phase: 'flyToPlayer',
      staging: INITIAL_STAGING,
      flyFrom: fromRect,
      flyTo: toRect,
      flyFaceUp: false,
      flyCard: null,
      flyOwnerColor: ownerColor,
    })
  }, [])

  /** When flyToPlayer completes */
  const onPlayerArrival = useCallback(() => {
    setState(INITIAL)
  }, [])

  /** Reconstruct staging from Firestore state on resume/refresh (Section 6) */
  const reconstructStaging = useCallback((
    drawnCard: Card | null,
    source: 'pile' | 'discard' | null,
  ) => {
    if (!drawnCard || !source) {
      setState(INITIAL)
      return
    }
    // Discard source: show card face-up in staging
    // Pile source: show generic face-down in staging
    setState({
      phase: 'staging',
      staging: {
        card: source === 'discard' ? drawnCard : null,
        source,
        faceUp: source === 'discard',
      },
      flyFrom: null,
      flyTo: null,
      flyFaceUp: false,
      flyCard: null,
      flyOwnerColor: undefined,
    })
  }, [])

  /** Reset everything */
  const reset = useCallback(() => {
    setState(INITIAL)
    pendingRef.current = {}
  }, [])

  return {
    choreo: state,
    startDiscardTake,
    onStagingArrival,
    startSwapFromStaging,
    onSlotArrival,
    onDiscardArrival,
    startDiscardAction,
    startPileDraw,
    onPlayerArrival,
    reconstructStaging,
    reset,
  }
}
