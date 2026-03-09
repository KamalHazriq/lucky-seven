import { useState, useCallback, useRef } from 'react'
import type { Card } from '../lib/types'

export interface FlyingCardState {
  active: boolean
  from: DOMRect | null
  to: DOMRect | null
  faceUp: boolean
  card?: Card | null
  ownerColor?: string
}

interface QueuedFly {
  from: DOMRect
  to: DOMRect
  faceUp: boolean
  card?: Card | null
  ownerColor?: string
}

const INITIAL: FlyingCardState = {
  active: false,
  from: null,
  to: null,
  faceUp: false,
  card: null,
  ownerColor: undefined,
}

/**
 * Flying card state with an optional queue for deferred animations.
 * When a modal is open, local player animations can be queued and
 * flushed when the modal closes.
 */
export function useFlyingCard() {
  const [state, setState] = useState<FlyingCardState>(INITIAL)
  const queueRef = useRef<QueuedFly[]>([])

  const triggerFly = useCallback((
    from: DOMRect,
    to: DOMRect,
    faceUp: boolean,
    card?: Card | null,
    ownerColor?: string,
  ) => {
    setState({ active: true, from, to, faceUp, card, ownerColor })
  }, [])

  /** Queue a fly animation for later (e.g., while modal is open) */
  const queueFly = useCallback((
    from: DOMRect,
    to: DOMRect,
    faceUp: boolean,
    card?: Card | null,
    ownerColor?: string,
  ) => {
    queueRef.current.push({ from, to, faceUp, card, ownerColor })
  }, [])

  /** Flush one queued animation. Returns true if a fly was started. */
  const flushQueue = useCallback(() => {
    const next = queueRef.current.shift()
    if (next) {
      setState({ active: true, ...next })
      return true
    }
    return false
  }, [])

  const clearFly = useCallback(() => {
    // When a fly completes, check if there's a queued one
    const next = queueRef.current.shift()
    if (next) {
      setState({ active: true, ...next })
    } else {
      setState(INITIAL)
    }
  }, [])

  const clearQueue = useCallback(() => {
    queueRef.current = []
  }, [])

  return { flyingCard: state, triggerFly, queueFly, flushQueue, clearFly, clearQueue }
}
