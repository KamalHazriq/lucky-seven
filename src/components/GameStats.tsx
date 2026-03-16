import { motion } from 'framer-motion'
import { useGlobalStats } from '../hooks/useGlobalStats'

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
 * GameStats — universal statistics section for the Home page.
 * All stats come from Supabase (shared across all devices).
 */
export default function GameStats() {
  const { stats, loading } = useGlobalStats()

  if (loading) return null

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
        className="grid grid-cols-2 gap-2"
      >
        <StatCard
          emoji={'\u{1F3AE}'}
          label="Games Played"
          value={stats.gamesPlayed}
          color="bg-slate-900/40 border-slate-700/40 hover:border-emerald-600/40"
        />
        <StatCard
          emoji={'\u{1F440}'}
          label="Total Visits"
          value={stats.totalVisits}
          color="bg-slate-900/40 border-slate-700/40 hover:border-amber-600/40"
        />
      </motion.div>
    </motion.div>
  )
}
