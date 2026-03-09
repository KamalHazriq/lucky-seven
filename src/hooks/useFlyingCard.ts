import { useState, useCallback } from 'react'
import type { Card } from '../lib/types'

export interface FlyingCardState {
  active: boolean
  from: DOMRect | null
  to: DOMRect | null
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

export function useFlyingCard() {
  const [state, setState] = useState<FlyingCardState>(INITIAL)

  const triggerFly = useCallback((
    from: DOMRect,
    to: DOMRect,
    faceUp: boolean,
    card?: Card | null,
    ownerColor?: string,
  ) => {
    setState({ active: true, from, to, faceUp, card, ownerColor })
  }, [])

  const clearFly = useCallback(() => {
    setState(INITIAL)
  }, [])

  return { flyingCard: state, triggerFly, clearFly }
}
