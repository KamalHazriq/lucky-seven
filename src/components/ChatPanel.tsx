import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSeatColor } from '../lib/playerColors'
import type { ChatMessage } from '../lib/types'

const QUICK_EMOJIS = ['\u{1F44D}', '\u{1F44E}', '\u{1F602}', '\u{1F631}', '\u{1F525}', '\u{1F389}', '\u{1F60E}', '\u{1F914}']

const CHAT_POS_KEY = 'lucky7_chat_pos'

function loadChatPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(CHAT_POS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    if (typeof p.x === 'number' && typeof p.y === 'number') return p
  } catch { /* ignore */ }
  return null
}

function saveChatPos(x: number, y: number) {
  localStorage.setItem(CHAT_POS_KEY, JSON.stringify({ x, y }))
}

interface ChatPanelProps {
  open: boolean
  messages: ChatMessage[]
  localUserId: string
  onSend: (text: string) => void
  onClose: () => void
}

export default function ChatPanel({ open, messages, localUserId, onSend, onClose }: ChatPanelProps) {
  const [text, setText] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Draggable position state (desktop only)
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => isDesktop ? loadChatPos() : null)
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!isDesktop) return
    e.preventDefault()
    const el = panelRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    // Use current position or derive from element's position
    const currentX = pos?.x ?? rect.left
    const currentY = pos?.y ?? rect.top
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: currentX, origY: currentY }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [isDesktop, pos])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    const newX = Math.max(0, Math.min(window.innerWidth - 320, dragRef.current.origX + dx))
    const newY = Math.max(0, Math.min(window.innerHeight - 100, dragRef.current.origY + dy))
    setPos({ x: newX, y: newY })
  }, [])

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return
    dragRef.current = null
    if (pos) saveChatPos(pos.x, pos.y)
  }, [pos])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handleSend = () => {
    if (!text.trim()) return
    onSend(text.trim())
    setText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: 20, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 350, damping: 26, mass: 0.6 }}
          className="fixed z-40 w-80 max-w-[calc(100vw-24px)] bg-slate-800/95 backdrop-blur-md border border-slate-600/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: 'min(420px, 60vh)',
            ...(isDesktop && pos
              ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' }
              : { bottom: '4.5rem', right: '0.75rem' }),
          }}
        >
          {/* Header — draggable on desktop */}
          <div
            className={`flex items-center justify-between px-3 py-2 border-b border-slate-700/50 ${isDesktop ? 'cursor-grab active:cursor-grabbing' : ''}`}
            onPointerDown={isDesktop ? handlePointerDown : undefined}
            onPointerMove={isDesktop ? handlePointerMove : undefined}
            onPointerUp={isDesktop ? handlePointerUp : undefined}
            style={isDesktop ? { touchAction: 'none' } : undefined}
          >
            <h3 className="text-sm font-semibold text-amber-300 select-none">Chat</h3>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs"
            >
              &times;
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[120px]">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-4">No messages yet. Say hi!</p>
            )}
            {messages.map((msg) => {
              const isLocal = msg.userId === localUserId
              const color = getSeatColor(msg.seatIndex)
              const isEmoji = /^\p{Emoji_Presentation}+$/u.test(msg.text) && msg.text.length <= 8

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
                >
                  {/* Name label */}
                  {!isLocal && (
                    <span
                      className="text-[10px] font-medium ml-1 mb-0.5"
                      style={{ color: color.text }}
                    >
                      {msg.displayName}
                    </span>
                  )}

                  {/* Bubble */}
                  {isEmoji ? (
                    <span className="text-3xl leading-none px-1">{msg.text}</span>
                  ) : (
                    <div
                      className={`
                        max-w-[85%] px-3 py-1.5 rounded-2xl text-sm leading-snug break-words
                        ${isLocal
                          ? 'rounded-br-sm text-white'
                          : 'rounded-bl-sm text-slate-100'
                        }
                      `}
                      style={{
                        backgroundColor: isLocal
                          ? color.solid
                          : 'rgba(51, 65, 85, 0.8)',
                        borderLeft: isLocal ? 'none' : `3px solid ${color.solid}`,
                      }}
                    >
                      {msg.text}
                    </div>
                  )}
                </motion.div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Quick emoji row */}
          <div className="flex gap-1 px-2 py-1.5 border-t border-slate-700/30">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onSend(emoji)}
                className="flex-1 text-center text-lg hover:scale-125 transition-transform cursor-pointer py-0.5"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 px-2 pb-2">
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              maxLength={300}
              className="flex-1 px-3 py-2 bg-slate-900/80 border border-slate-600/60 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
            <button
              onClick={handleSend}
              disabled={!text.trim()}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors cursor-pointer"
            >
              Send
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
