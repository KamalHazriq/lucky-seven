import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useAuth } from '../hooks/useAuth'
import { useGame } from '../hooks/useGame'
import { startGame, updatePlayerProfile } from '../lib/gameService'
import VersionLabel from '../components/VersionLabel'
import FeedbackModal from '../components/FeedbackModal'
import PatchNotesModal from '../components/PatchNotesModal'
import ChatPanel from '../components/ChatPanel'
import { useChat } from '../hooks/useChat'
import { getJoinLink, getInviteMessage, copyToClipboard } from '../lib/share'
import { LOBBY_COLORS } from '../lib/playerColors'

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
          className="w-8 h-8 border-2 border-slate-400 border-t-transparent rounded-full"
        />
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 text-lg mb-4">Game not found</p>
          <button
            onClick={() => navigate('/')}
            className="text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            Go Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-amber-300 mb-1">Game Lobby</h1>
          <p className="text-slate-400 text-sm">Waiting for players...</p>
        </div>

        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 shadow-xl">
          {/* Join Code + Share */}
          <div className="text-center mb-6">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Join Code</p>
            <button
              onClick={handleCopyCode}
              className="text-3xl font-mono font-bold text-emerald-400 tracking-[0.3em] hover:text-emerald-300 transition-colors cursor-pointer"
              title="Click to copy code"
            >
              {game.joinCode}
            </button>
            <p className="text-xs text-slate-500 mt-1">Click to copy code</p>

            {/* Share buttons */}
            <div className="flex items-center justify-center gap-2 mt-3">
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/30 border border-indigo-600/40 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-900/50 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Copy Link
              </button>
              <button
                onClick={handleCopyInvite}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 border border-emerald-600/40 text-emerald-400 rounded-lg text-xs font-medium hover:bg-emerald-900/50 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Invite Friends
              </button>
            </div>
          </div>

          {/* Your Profile — name edit + color picker */}
          {myPlayer && (
            <div className="border-t border-slate-700/50 pt-4 mb-4">
              <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Your Profile</p>
              <div className="flex items-center gap-2 mb-2">
                {editingName ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      ref={nameRef}
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value.slice(0, 12))}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false) }}
                      maxLength={12}
                      className="flex-1 px-2 py-1 bg-slate-900/80 border border-slate-600/60 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500/60"
                    />
                    <button
                      onClick={handleSaveName}
                      disabled={!nameInput.trim()}
                      className="px-2 py-1 bg-emerald-600/80 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingName(false)}
                      className="px-2 py-1 bg-slate-700/60 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="font-medium text-slate-200 text-sm">{myPlayer.displayName}</span>
                    <button
                      onClick={handleStartEditName}
                      className="px-2 py-0.5 bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-200 rounded-md text-[10px] font-medium cursor-pointer transition-colors"
                    >
                      Edit
                    </button>
                  </>
                )}
              </div>
              <div className="grid grid-cols-8 gap-1.5">
                {LOBBY_COLORS.map((color, idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePickColor(idx)}
                    className={`w-7 h-7 rounded-full border-2 transition-all cursor-pointer hover:scale-110 ${
                      myPlayer.colorKey === idx
                        ? 'border-white scale-110 ring-2 ring-white/30'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    title={`Pick color ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-700/50 pt-4 mb-4">
            <p className="text-xs text-slate-400 uppercase tracking-wider mb-3">
              Players ({playerList.length}/{game.maxPlayers})
            </p>

            <div className="space-y-2">
              {playerList.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-3 bg-slate-900/40 rounded-lg p-3"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{
                      backgroundColor: p.colorKey != null && p.colorKey >= 0 && p.colorKey < LOBBY_COLORS.length
                        ? LOBBY_COLORS[p.colorKey]
                        : '#6366f1',
                    }}
                  >
                    {p.displayName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="font-medium text-slate-200">
                    {p.displayName ?? 'Unknown'}
                  </span>
                  {p.id === game.hostId && (
                    <span className="ml-auto text-xs bg-amber-600/20 text-amber-400 px-2 py-0.5 rounded-full">
                      Host
                    </span>
                  )}
                  {p.id === user?.uid && p.id !== game.hostId && (
                    <span className="ml-auto text-xs bg-indigo-600/20 text-indigo-400 px-2 py-0.5 rounded-full">
                      You
                    </span>
                  )}
                </motion.div>
              ))}

              {/* Empty seats */}
              {Array.from({ length: game.maxPlayers - playerList.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center gap-3 bg-slate-900/20 rounded-lg p-3 border border-dashed border-slate-700"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center">
                    <span className="text-slate-500 text-sm">?</span>
                  </div>
                  <span className="text-slate-500 text-sm">Waiting...</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <button
              onClick={handleStart}
              disabled={playerList.length < 2}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg transition-all cursor-pointer"
            >
              {playerList.length < 2 ? 'Need at least 2 players' : 'Start Game'}
            </button>
          )}

          {!isHost && (
            <div className="text-center py-3">
              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-slate-400 text-sm"
              >
                Waiting for host to start the game...
              </motion.p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mt-4">
          <button
            onClick={() => navigate('/')}
            className="text-sm text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            Leave Lobby
          </button>
          <span className="text-slate-700">|</span>
          <button
            onClick={chat.toggleChat}
            className="relative text-sm text-indigo-400 hover:text-indigo-300 cursor-pointer"
          >
            {'\u{1F4AC}'} Chat
            {chat.unreadCount > 0 && (
              <span className="absolute -top-2 -right-3 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {chat.unreadCount > 9 ? '9+' : chat.unreadCount}
              </span>
            )}
          </button>
          <span className="text-slate-700">|</span>
          <button
            onClick={() => setShowPatchNotes(true)}
            className="text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Patch Notes
          </button>
          <span className="text-slate-700">|</span>
          <button
            onClick={() => setShowFeedback(true)}
            className="text-sm text-amber-600 hover:text-amber-400 cursor-pointer"
          >
            Send Feedback
          </button>
        </div>
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
