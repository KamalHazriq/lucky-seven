import { useState, useEffect, useCallback, useRef } from 'react'
import { subscribeChat, sendChatMessage } from '../lib/gameService'
import type { ChatMessage } from '../lib/types'

/**
 * Lazy chat subscription — only subscribes to Firestore when the user
 * opens the chat panel for the first time (saves reads).
 */
export function useChat(
  gameId: string | undefined,
  displayName: string,
  seatIndex: number,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const isOpenRef = useRef(isOpen)
  const prevMsgCountRef = useRef(0)

  // Keep ref in sync
  isOpenRef.current = isOpen

  // Subscribe to chat only after first open (lazy)
  useEffect(() => {
    if (!gameId || !subscribed) return
    const unsub = subscribeChat(gameId, (msgs) => {
      setMessages(msgs)
      // Track unread when chat is closed
      if (!isOpenRef.current && msgs.length > prevMsgCountRef.current) {
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
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
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
      sendChatMessage(gameId, text.trim(), displayName, seatIndex)
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
