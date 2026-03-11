import { useState, useEffect, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { subscribeChat, sendChatMessage } from '../lib/gameService'
import type { ChatMessage } from '../lib/types'

const STORAGE_KEY = 'lucky7_chat_open'

function getIsMobile(): boolean {
  return window.innerWidth < 768
}

function getStoredPref(): boolean | null {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

/**
 * Chat hook with smart subscription lifecycle and localStorage-persisted open state.
 *
 * Subscription rules (quota-conscious):
 * - Desktop: stays subscribed while chat is open (default open). Closing on desktop
 *   keeps the subscription alive so chat bubbles + unread counts still work.
 * - Mobile: subscribes only while chat is open. Closing tears down the listener
 *   to save Firestore reads. Bubbles use the last-known messages array.
 *
 * Only one onSnapshot listener is ever active at a time.
 */
export function useChat(
  gameId: string | undefined,
  displayName: string,
  seatIndex: number,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Determine initial open state: localStorage pref > responsive default
  const [isOpen, setIsOpen] = useState(() => {
    const stored = getStoredPref()
    if (stored !== null) return stored
    return !getIsMobile() // desktop = open, mobile = closed
  })

  // Track whether we should be subscribed right now.
  // Desktop: subscribe eagerly (for bubble notifications even when panel closed).
  // Mobile: subscribe only while chat panel is open.
  const [subscribed, setSubscribed] = useState(isOpen)

  const isOpenRef = useRef(isOpen)
  const prevMsgCountRef = useRef(0)

  // Keep ref in sync
  isOpenRef.current = isOpen

  // ─── Firestore subscription (single listener) ────────────────
  useEffect(() => {
    if (!gameId || !subscribed) return
    const unsub = subscribeChat(gameId, (msgs) => {
      setMessages(msgs)
      // Track unread only when chat is closed AND tab is visible
      // (document.hidden prevents inflated badge from background Firestore snapshots)
      if (!isOpenRef.current && !document.hidden && msgs.length > prevMsgCountRef.current) {
        setUnreadCount((c) => c + (msgs.length - prevMsgCountRef.current))
      }
      prevMsgCountRef.current = msgs.length
    })
    return unsub
  }, [gameId, subscribed])

  const openChat = useCallback(() => {
    setSubscribed(true)
    setIsOpen(true)
    setUnreadCount(0)
    localStorage.setItem(STORAGE_KEY, 'true')
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
    localStorage.setItem(STORAGE_KEY, 'false')
    // On mobile, tear down listener to save Firestore reads.
    // On desktop, keep it alive for bubbles + unread badge.
    if (getIsMobile()) {
      setSubscribed(false)
    }
  }, [])

  const toggleChat = useCallback(() => {
    if (isOpenRef.current) {
      closeChat()
    } else {
      openChat()
    }
  }, [openChat, closeChat])

  const send = useCallback(
    (text: string) => {
      if (!gameId || !text.trim()) return
      sendChatMessage(gameId, text.trim(), displayName, seatIndex).catch((e) => {
        toast.error(`Chat failed: ${(e as Error).message}`)
      })
    },
    [gameId, displayName, seatIndex],
  )

  return {
    messages,
    unreadCount,
    isOpen,
    openChat,
    closeChat,
    toggleChat,
    send,
  }
}
