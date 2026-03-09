import { useState, useEffect, useRef } from 'react'
import type { ChatMessage } from '../lib/types'

const BUBBLE_DURATION_MS = 4000

/**
 * Derives per-player latest chat bubble from chat messages.
 * UI-only — auto-clears after 4 seconds. No Firestore writes.
 *
 * Only shows bubbles for messages that arrive AFTER the initial snapshot.
 * Bubbles appear for remote players only (not local user).
 */
export function useChatBubbles(
  messages: ChatMessage[],
  localUserId: string,
): Record<string, string | null> {
  const [bubbles, setBubbles] = useState<Record<string, string | null>>({})
  const prevCountRef = useRef(0)
  const initializedRef = useRef(false)
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    // First time we receive messages, just record the count (initial snapshot)
    if (!initializedRef.current) {
      if (messages.length > 0) {
        prevCountRef.current = messages.length
        initializedRef.current = true
      }
      return
    }

    // Only process truly new messages (after initial load)
    if (messages.length <= prevCountRef.current) {
      prevCountRef.current = messages.length
      return
    }

    const newMsgs = messages.slice(prevCountRef.current)
    prevCountRef.current = messages.length

    for (const msg of newMsgs) {
      // Don't show bubbles for local user (they see their own in the chat panel)
      if (msg.userId === localUserId) continue

      const uid = msg.userId
      const text = msg.text.length > 40 ? msg.text.slice(0, 38) + '\u2026' : msg.text

      // Clear existing timer for this user
      if (timersRef.current[uid]) clearTimeout(timersRef.current[uid])

      setBubbles((prev) => ({ ...prev, [uid]: text }))

      // Auto-clear after duration
      timersRef.current[uid] = setTimeout(() => {
        setBubbles((prev) => ({ ...prev, [uid]: null }))
      }, BUBBLE_DURATION_MS)
    }
  }, [messages.length, messages, localUserId])

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timersRef.current).forEach(clearTimeout)
    }
  }, [])

  return bubbles
}
