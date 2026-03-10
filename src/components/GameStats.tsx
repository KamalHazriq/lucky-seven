import { motion } from 'framer-motion'
import { useGlobalStats, formatTimePlayed } from '../hooks/useGlobalStats'

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }

const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.05 },
  },
}
const staggerItem = {
  hidden: { opacity: 0, y: 12, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: springEntry },
}

interface StatCardProps {
  emoji: string
  label: string
  value: string | number
  color: string
}

function StatCard({ emoji, label, value, color }: StatCardProps) {
  return (
    <motion.div
      variants={staggerItem}
      whileHover={{ scale: 1.04, y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-colors ${color}`}
    >
      <span className="text-lg">{emoji}</span>
      <span className="text-lg font-bold text-white tabular-nums">{value}</span>
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{label}</span>
    </motion.div>
  )
}

/**
 * GameStats — premium statistics section for the Home page.
 * Reads from Firestore global stats + local storage.
 * Design: section cards with emojis, grid layout, matching rulebook style.
 */
export default function GameStats() {
  const { stats, loading, totalVisits, timePlayed } = useGlobalStats()

  if (loading) return null

  // Local win tracking
  const wins = parseInt(localStorage.getItem('lucky7_wins') ?? '0', 10)
  const localGames = parseInt(localStorage.getItem('lucky7_local_games') ?? '0', 10)
  const winRate = localGames > 0 ? Math.round((wins / localGames) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.7, ...springEntry }}
      className="mt-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">{'\u{1F4CA}'}</span>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Game Statistics</h3>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="show"
        className="grid grid-cols-3 gap-2"
      >
        <StatCard
          emoji={'\u{1F3AE}'}
          label="Games Played"
          value={stats.gamesPlayed}
          color="bg-slate-900/40 border-slate-700/40 hover:border-emerald-600/40"
        />
        <StatCard
          emoji={'\u{23F1}\uFE0F'}
          label="Time Played"
          value={formatTimePlayed(timePlayed)}
          color="bg-slate-900/40 border-slate-700/40 hover:border-indigo-600/40"
        />
        <StatCard
          emoji={'\u{1F440}'}
          label="Total Visits"
          value={totalVisits}
          color="bg-slate-900/40 border-slate-700/40 hover:border-amber-600/40"
        />
        <StatCard
          emoji={'\u{1F3C6}'}
          label="Wins"
          value={wins}
          color="bg-slate-900/40 border-slate-700/40 hover:border-yellow-600/40"
        />
        <StatCard
          emoji={'\u{1F4AF}'}
          label="Win Rate"
          value={localGames > 0 ? `${winRate}%` : '--'}
          color="bg-slate-900/40 border-slate-700/40 hover:border-purple-600/40"
        />
        <StatCard
          emoji={'\u{1F4C5}'}
          label="Your Games"
          value={localGames}
          color="bg-slate-900/40 border-slate-700/40 hover:border-cyan-600/40"
        />
      </motion.div>
    </motion.div>
  )
}
