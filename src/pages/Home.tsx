import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { createGame, joinGame, findGameByCode } from '../lib/gameService'
import { useAuth } from '../hooks/useAuth'
import HowToPlay from '../components/HowToPlay'
import FeedbackModal from '../components/FeedbackModal'
import VersionLabel from '../components/VersionLabel'
import PatchNotesModal from '../components/PatchNotesModal'
import GameStats from '../components/GameStats'
import StrategyTips from '../components/StrategyTips'
import type { PowerAssignments, PowerEffectType, PowerRankKey, DeckSize } from '../lib/types'
import { DEFAULT_GAME_SETTINGS, ALL_EFFECT_TYPES, DEFAULT_POWER_ASSIGNMENTS } from '../lib/types'

const RANK_ROWS: { key: PowerRankKey; label: string; color: string }[] = [
  { key: '10', label: '10', color: 'text-cyan-300' },
  { key: 'J', label: 'Jack', color: 'text-amber-300' },
  { key: 'Q', label: 'Queen', color: 'text-purple-300' },
  { key: 'K', label: 'King', color: 'text-red-300' },
  { key: 'JOKER', label: 'Joker', color: 'text-fuchsia-300' },
]

/** Floating card suits — decorative background elements */
const FLOATING_SUITS = [
  { emoji: '\u2660', x: '12%', y: '18%', delay: 0, dur: 5.5, size: 'text-3xl' },
  { emoji: '\u2665', x: '82%', y: '22%', delay: 1.2, dur: 6, size: 'text-2xl' },
  { emoji: '\u2666', x: '8%', y: '72%', delay: 2.3, dur: 5, size: 'text-xl' },
  { emoji: '\u2663', x: '88%', y: '68%', delay: 0.8, dur: 6.5, size: 'text-3xl' },
  { emoji: '7', x: '20%', y: '85%', delay: 3.0, dur: 7, size: 'text-4xl font-bold' },
  { emoji: '\u2665', x: '75%', y: '82%', delay: 1.6, dur: 5.8, size: 'text-lg' },
  { emoji: '\u2660', x: '50%', y: '8%', delay: 2.0, dur: 6.2, size: 'text-xl' },
]

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }
const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.15 },
  },
}
const staggerItem = {
  hidden: { opacity: 0, y: 16, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: springEntry },
}

export default function Home() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [joinCode, setJoinCode] = useState('')
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu')
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [showPatchNotes, setShowPatchNotes] = useState(false)

  // Power settings state
  const [assignments, setAssignments] = useState<PowerAssignments>({ ...DEFAULT_POWER_ASSIGNMENTS })
  const [jokerCount, setJokerCount] = useState(DEFAULT_GAME_SETTINGS.jokerCount)
  const [deckSize, setDeckSize] = useState<DeckSize>(DEFAULT_GAME_SETTINGS.deckSize)

  const updateAssignment = (key: PowerRankKey, value: PowerEffectType) => {
    setAssignments((prev) => ({ ...prev, [key]: value }))
  }

  const handleCreate = async () => {
    if (!name.trim()) return toast.error('Enter your name')
    if (!user) return toast.error('Authenticating...')
    setBusy(true)
    try {
      const gameId = await createGame(name.trim(), maxPlayers, {
        powerAssignments: assignments,
        jokerCount,
        deckSize,
      })
      navigate(`/lobby/${gameId}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleJoin = async () => {
    if (!name.trim()) return toast.error('Enter your name')
    if (!joinCode.trim()) return toast.error('Enter a join code')
    if (!user) return toast.error('Authenticating...')
    setBusy(true)
    try {
      const gameId = await findGameByCode(joinCode.trim().toUpperCase())
      if (!gameId) {
        toast.error('Game not found. Check the code and try again.')
        setBusy(false)
        return
      }
      await joinGame(gameId, name.trim())
      navigate(`/lobby/${gameId}`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) {
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Floating decorative suits — gentle float animation */}
      {FLOATING_SUITS.map((suit, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: [0, 0.08, 0.12, 0.08, 0],
            scale: [0.8, 1, 1.05, 1, 0.8],
            y: [0, -15, -5, -20, 0],
            rotate: [0, 5, -3, 8, 0],
          }}
          transition={{
            duration: suit.dur,
            delay: suit.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className={`fixed ${suit.size} text-slate-300 pointer-events-none select-none`}
          style={{ left: suit.x, top: suit.y }}
        >
          {suit.emoji}
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springEntry}
        className="w-full max-w-md relative z-10"
      >
        {/* Title with enhanced animation */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotateZ: -5 }}
            animate={{ scale: 1, opacity: 1, rotateZ: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, mass: 0.8 }}
          >
            <h1 className="text-5xl font-bold bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent mb-1 drop-shadow-sm">
              Lucky Seven{'\u2122'}
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, ...springEntry }}
            className="text-slate-400 text-sm"
          >
            The card game where 7 means zero
          </motion.p>
          {/* Animated accent line */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 20 }}
            className="mx-auto mt-3 h-0.5 w-24 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent"
          />
        </div>

        {/* Card container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, ...springEntry }}
          className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-6 shadow-2xl shadow-black/20"
        >
          <AnimatePresence mode="wait">
            {mode === 'menu' && (
              <motion.div
                key="menu"
                variants={staggerContainer}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: -10, transition: { duration: 0.15 } }}
                className="space-y-3"
              >
                <motion.div variants={staggerItem}>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={() => setMode('create')}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white rounded-xl font-semibold text-lg transition-all shadow-lg shadow-emerald-600/20 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">{'\u{1F3B4}'}</span>
                    Create Game
                  </motion.button>
                </motion.div>
                <motion.div variants={staggerItem}>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    onClick={() => setMode('join')}
                    className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-semibold text-lg transition-all shadow-lg shadow-indigo-600/20 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span className="text-xl">{'\u{1F91D}'}</span>
                    Join Game
                  </motion.button>
                </motion.div>
              </motion.div>
            )}

            {mode === 'create' && (
              <motion.div
                key="create"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30, transition: { duration: 0.15 } }}
                transition={springEntry}
                className="space-y-4"
              >
                <motion.button
                  whileHover={{ x: -4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={() => setMode('menu')}
                  className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer flex items-center gap-1"
                >
                  {'\u2190'} Back
                </motion.button>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={20}
                    className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Max Players</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <motion.button
                        key={n}
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => {
                          setMaxPlayers(n)
                          if (n >= 7 && deckSize === 1) {
                            toast('Tip: 7+ players work best with 1.5\u00d7 or 2\u00d7 deck!', { icon: '\u{1F4A1}' })
                          } else if (n >= 5 && deckSize === 1) {
                            toast('Tip: 5+ players may run low on cards. Consider 1.5\u00d7 deck.', { icon: '\u{1F4A1}' })
                          }
                        }}
                        className={`flex-1 min-w-[40px] py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          maxPlayers === n
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {n}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Deck Size</label>
                  <div className="flex gap-2">
                    {([1, 1.5, 2] as DeckSize[]).map((ds) => (
                      <motion.button
                        key={ds}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setDeckSize(ds)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          deckSize === ds
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {ds === 1 ? '1\u00d7' : ds === 1.5 ? '1.5\u00d7' : '2\u00d7'}
                      </motion.button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {deckSize === 1 ? '54 cards (standard)' : deckSize === 1.5 ? '~81 cards (1 full + 27 extra)' : '~108 cards (double deck)'}
                  </p>
                </div>

                {/* Power Settings accordion */}
                <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setShowSettings(!showSettings)}
                    className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-900/40 hover:bg-slate-900/60 transition-colors cursor-pointer"
                  >
                    <span className="text-sm font-medium text-slate-300">Power Settings</span>
                    <motion.span
                      animate={{ rotate: showSettings ? 180 : 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="text-slate-500"
                    >
                      {'\u25BC'}
                    </motion.span>
                  </motion.button>

                  <AnimatePresence initial={false}>
                    {showSettings && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 28, mass: 0.6 }}
                        className="overflow-hidden"
                      >
                        <div className="p-4 space-y-3 border-t border-slate-700/50">
                          {RANK_ROWS.map((row) => (
                            <div key={row.key}>
                              <label className={`block text-xs font-medium ${row.color} mb-1`}>
                                {row.label} Power
                              </label>
                              <select
                                value={assignments[row.key]}
                                onChange={(e) => updateAssignment(row.key, e.target.value as PowerEffectType)}
                                className="w-full px-3 py-1.5 bg-slate-900/80 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer"
                              >
                                {ALL_EFFECT_TYPES.map((o) => (
                                  <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                              </select>
                            </div>
                          ))}

                          <div>
                            <label className="block text-xs font-medium text-fuchsia-300 mb-1">
                              Jokers in Deck
                            </label>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4].map((n) => (
                                <motion.button
                                  key={n}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => setJokerCount(n)}
                                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                                    jokerCount === n
                                      ? 'bg-fuchsia-600 text-white'
                                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                                  }`}
                                >
                                  {n}
                                </motion.button>
                              ))}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">Default: 2 (standard deck)</p>
                          </div>

                          <div className="bg-slate-900/40 rounded-lg p-2">
                            <p className="text-[10px] text-amber-400/80 font-medium">
                              Powers can be used every time you draw that card type. Any rank can be assigned any effect!
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCreate}
                  disabled={busy}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-600/15"
                >
                  {busy ? 'Creating...' : 'Create Game'}
                </motion.button>
              </motion.div>
            )}

            {mode === 'join' && (
              <motion.div
                key="join"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30, transition: { duration: 0.15 } }}
                transition={springEntry}
                className="space-y-4"
              >
                <motion.button
                  whileHover={{ x: -4 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  onClick={() => setMode('menu')}
                  className="text-slate-400 hover:text-slate-200 text-sm cursor-pointer flex items-center gap-1"
                >
                  {'\u2190'} Back
                </motion.button>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={20}
                    className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Join Code</label>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. ABC123"
                    maxLength={6}
                    className="w-full px-4 py-2.5 bg-slate-900/80 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors uppercase tracking-widest text-center text-lg"
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleJoin}
                  disabled={busy}
                  className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold transition-all cursor-pointer shadow-lg shadow-indigo-600/15"
                >
                  {busy ? 'Joining...' : 'Join Game'}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-6 space-y-1"
        >
          <p className="text-xs text-slate-500">
            2-8 players &middot; Lowest score wins &middot; Sevens are worth zero!
          </p>
          <div className="flex items-center justify-center gap-3">
            <HowToPlay />
            <span className="text-slate-700">|</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowPatchNotes(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              Patch Notes
            </motion.button>
            <span className="text-slate-700">|</span>
            <motion.button
              whileHover={{ scale: 1.05 }}
              onClick={() => setShowFeedback(true)}
              className="text-xs text-amber-600 hover:text-amber-400 cursor-pointer"
            >
              Send Feedback
            </motion.button>
          </div>
        </motion.div>

        {/* Game Statistics */}
        <GameStats />

        {/* Strategy Tips */}
        <StrategyTips />
      </motion.div>

      <FeedbackModal open={showFeedback} onClose={() => setShowFeedback(false)} />
      <PatchNotesModal open={showPatchNotes} onClose={() => setShowPatchNotes(false)} />
      <VersionLabel />

      {/* Watermark */}
      <div className="fixed bottom-2 right-3 text-xs md:text-sm font-medium pointer-events-none select-none z-10" style={{ color: 'var(--watermark)' }}>
        Built by Kamal Hazriq
      </div>
    </div>
  )
}
