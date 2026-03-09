import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getSeatColor } from '../lib/playerColors'
import type { ChatMessage } from '../lib/types'

const QUICK_EMOJIS = ['\u{1F44D}', '\u{1F44E}', '\u{1F602}', '\u{1F631}', '\u{1F525}', '\u{1F389}', '\u{1F60E}', '\u{1F914}']

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
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed bottom-16 right-3 z-40 w-80 max-w-[calc(100vw-24px)] bg-slate-800/95 backdrop-blur-md border border-slate-600/60 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(420px, 60vh)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
            <h3 className="text-sm font-semibold text-amber-300">Chat</h3>
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
              maxLength={200}
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
