import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { startGame, updatePlayerProfile, leaveLobby } from '../lib/gameService'
import VersionLabel from '../components/VersionLabel'
import FeedbackModal from '../components/FeedbackModal'
import PatchNotesModal from '../components/PatchNotesModal'
import ChatPanel from '../components/ChatPanel'
import { useChat } from '../hooks/useChat'
import { getJoinLink, getInviteMessage, copyToClipboard } from '../lib/share'
import { LOBBY_COLORS } from '../lib/playerColors'

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }
const springBounce = { type: 'spring' as const, stiffness: 400, damping: 20 }

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
}
const staggerItem = {
  hidden: { opacity: 0, x: -20, scale: 0.95 },
  show: { opacity: 1, x: 0, scale: 1, transition: springEntry },
}

export default function Lobby() {
  const { gameId } = useParams<{ gameId: string }>()
  const { user } = useAuth()
  const { game, players, loading } = useGame(gameId, user?.uid)
  const navigate = useNavigate()
  const [showFeedback, setShowFeedback] = useState(false)
  const [showPatchNotes, setShowPatchNotes] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const myPlayer = user ? players[user.uid] : null
  const chat = useChat(
    gameId,
    myPlayer?.displayName ?? 'Player',
    myPlayer?.seatIndex ?? 0,
  )

  // Redirect to game when it starts
  useEffect(() => {
    if (game?.status === 'active' || game?.status === 'ending') {
      navigate(`/game/${gameId}`, { replace: true })
    }
    if (game?.status === 'finished') {
      navigate(`/results/${gameId}`, { replace: true })
    }
  }, [game?.status, gameId, navigate])

  const isHost = user?.uid === game?.hostId
  const playerList = game?.playerOrder.map((pid) => ({
    id: pid,
    ...players[pid],
  })) ?? []

  const handleStart = async () => {
    if (!gameId) return
    try {
      await startGame(gameId)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleCopyCode = () => {
    if (game?.joinCode) {
      copyToClipboard(game.joinCode)
      toast.success('Code copied!')
    }
  }

  const handleCopyLink = () => {
    if (game?.joinCode) {
      copyToClipboard(getJoinLink(game.joinCode))
      toast.success('Room link copied!')
    }
  }

  const handleCopyInvite = () => {
    if (game?.joinCode && gameId) {
      copyToClipboard(getInviteMessage(game.joinCode, gameId))
      toast.success('Invite message copied!')
    }
  }

  const handleStartEditName = () => {
    setNameInput(myPlayer?.displayName ?? '')
    setEditingName(true)
    setTimeout(() => nameRef.current?.focus(), 50)
  }

  const handleSaveName = async () => {
    if (!gameId || !nameInput.trim()) return
    try {
      await updatePlayerProfile(gameId, { displayName: nameInput.trim() })
      toast.success('Name updated!')
    } catch (e) {
      toast.error((e as Error).message)
    }
    setEditingName(false)
  }

  const handlePickColor = async (colorIdx: number) => {
    if (!gameId) return
    try {
      await updatePlayerProfile(gameId, { colorKey: colorIdx })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={springEntry}
          className="text-center"
        >
          <p className="text-slate-400 text-lg mb-4">Game not found</p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/')}
            className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Go Home
          </motion.button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springEntry}
        className="w-full max-w-md"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, ...springEntry }}
          className="text-center mb-6"
        >
          <h1 className="text-3xl font-bold text-amber-300 mb-1">Game Lobby</h1>
          <motion.p
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            className="text-slate-400 text-sm"
          >
            Waiting for players...
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, ...springEntry }}
          className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 shadow-2xl shadow-black/20"
        >
          {/* Join Code + Share */}
          <div className="text-center mb-6">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Join Code</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={springBounce}
              onClick={handleCopyCode}
              className="text-3xl font-mono font-bold text-emerald-400 tracking-[0.3em] hover:text-emerald-300 transition-colors cursor-pointer"
              title="Click to copy code"
            >
              {game.joinCode}
            </motion.button>
            <p className="text-xs text-slate-500 mt-1">Click to copy code</p>

            {/* Share buttons */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, ...springEntry }}
              className="flex items-center justify-center gap-2 mt-3"
            >
              <motion.button
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/30 border border-indigo-600/40 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-900/50 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy Link
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05, y: -1 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopyInvite}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 border border-emerald-600/40 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Invite Friends
              </motion.button>
            </motion.div>
          </div>

          {/* Your Profile — name edit + color picker */}
          {myPlayer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="border-t border-slate-700/50 pt-4 mb-4"
            >
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Your Profile</p>
              <div className="flex items-center gap-2 mb-2">
                <AnimatePresence mode="wait">
                  {editingName ? (
                    <motion.div
                      key="editing"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={springEntry}
                      className="flex items-center gap-1.5 flex-1"
                    >
                      <input
                        ref={nameRef}
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value.slice(0, 12))}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                        maxLength={12}
                        className="flex-1 px-2 py-1 bg-slate-900/80 border border-slate-600/60 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/60"
                      />
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleSaveName}
                        disabled={!nameInput.trim()}
                        className="px-2 py-1 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
                      >
                        Save
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setEditingName(false)}
                        className="px-2 py-1 bg-slate-700/60 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                      >
                        Cancel
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="display"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2"
                    >
                      <span className="font-medium text-slate-200 text-sm">{myPlayer.displayName}</span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={handleStartEditName}
                        className="px-2 py-0.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 rounded-md text-[10px] font-medium cursor-pointer transition-colors"
                      >
                        Edit
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {LOBBY_COLORS.map((color, idx) => (
                  <motion.button
                    key={idx}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.85 }}
                    transition={springBounce}
                    onClick={() => handlePickColor(idx)}
                    className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer ${
                      myPlayer.colorKey === idx
                        ? 'border-white scale-110 ring-2 ring-white/30'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    title={`Pick color ${idx + 1}`}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div className="border-t border-slate-700/50 pt-4 mb-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">
              Players ({playerList.length}/{game.maxPlayers})
            </p>

            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="show"
              className="space-y-2"
            >
              {playerList.map((p) => (
                <motion.div
                  key={p.id}
                  variants={staggerItem}
                  layout
                  className="flex items-center gap-3 bg-slate-900/40 rounded-xl p-3"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25, delay: 0.1 }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md"
                    style={{
                      backgroundColor: p.colorKey != null && p.colorKey >= 0 && p.colorKey < LOBBY_COLORS.length
                        ? LOBBY_COLORS[p.colorKey]
                        : '#6366f1',
                    }}
                  >
                    {p.displayName?.[0]?.toUpperCase() ?? '?'}
                  </motion.div>
                  <span className="font-medium text-slate-200">
                    {p.displayName ?? 'Unknown'}
                  </span>
                  {p.id === game.hostId && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={springBounce}
                      className="ml-auto text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-full font-medium"
                    >
                      Host
                    </motion.span>
                  )}
                  {p.id === user?.uid && p.id !== game.hostId && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={springBounce}
                      className="ml-auto text-xs bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium"
                    >
                      You
                    </motion.span>
                  )}
                </motion.div>
              ))}

              {/* Empty seats — animated pulse */}
              {Array.from({ length: game.maxPlayers - playerList.length }).map((_, i) => (
                <motion.div
                  key={`empty-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: playerList.length * 0.06 + i * 0.1 }}
                  className="flex items-center gap-3 bg-slate-900/20 rounded-xl p-3 border border-dashed border-slate-700"
                >
                  <motion.div
                    animate={{ opacity: [0.3, 0.6, 0.3] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                    className="w-9 h-9 rounded-full bg-slate-700/50 flex items-center justify-center"
                  >
                    <span className="text-slate-500 text-sm">?</span>
                  </motion.div>
                  <motion.span
                    animate={{ opacity: [0.4, 0.7, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                    className="text-slate-500 text-sm"
                  >
                    Waiting...
                  </motion.span>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {isHost && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, ...springEntry }}
              whileHover={playerList.length >= 2 ? { scale: 1.02, y: -2 } : undefined}
              whileTap={playerList.length >= 2 ? { scale: 0.98 } : undefined}
              onClick={handleStart}
              disabled={playerList.length < 2}
              className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg transition-all cursor-pointer shadow-lg shadow-emerald-600/15"
            >
              {playerList.length < 2 ? 'Need at least 2 players' : 'Start Game'}
            </motion.button>
          )}

          {!isHost && (
            <div className="text-center py-3">
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex items-center justify-center gap-2"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full"
                />
                <span className="text-slate-400 text-sm">
                  Waiting for host to start the game...
                </span>
              </motion.div>
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-4 mt-4 flex-wrap"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={async () => {
              if (!confirm('Leave this lobby?')) return
              try {
                if (gameId) await leaveLobby(gameId)
              } catch (e) {
                console.error('Failed to leave lobby:', e)
              }
              navigate('/')
            }}
            className="text-sm text-red-400 hover:text-red-300 cursor-pointer"
          >
            Leave Lobby
          </motion.button>
          <span className="text-slate-700">|</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={chat.toggleChat}
            className="relative text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            {'\u{1F4AC}'} Chat
            {chat.unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-2 -right-3 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center"
              >
                {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
              </motion.span>
            )}
          </motion.button>
          <span className="text-slate-700">|</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setShowPatchNotes(true)}
            className="text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Patch Notes
          </motion.button>
          <span className="text-slate-700">|</span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => setShowFeedback(true)}
            className="text-sm text-amber-600 hover:text-amber-400 cursor-pointer"
          >
            Send Feedback
          </motion.button>
        </motion.div>
      </motion.div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
      <PatchNotesModal open={showPatchNotes} onClose={() => setShowPatchNotes(false)} />
      <ChatPanel
        open={chat.isOpen}
        messages={chat.messages}
        localUserId={user?.uid ?? ''}
        onSend={chat.send}
        onClose={chat.closeChat}
      />
      <VersionLabel />

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
