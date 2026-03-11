import { motion } from 'framer-motion'

interface Props {
  remaining: number | null
  total: number
  isMyTurn: boolean
}

export default function TurnTimer({ remaining, total, isMyTurn }: Props) {
  if (remaining === null || total === 0) return null

  const pct = total > 0 ? Math.max(0, remaining / total) : 0
  const urgent = remaining <= 10
  const critical = remaining <= 5

  // Color transitions: green → amber → red
  const barColor = critical
    ? 'bg-red-500'
    : urgent
      ? 'bg-amber-500'
      : 'bg-emerald-500'

  const textColor = critical
    ? 'text-red-400'
    : urgent
      ? 'text-amber-400'
      : 'text-slate-400'

  return (
    <div className="flex items-center gap-2 w-full">
      {/* Progress bar — scaleX instead of width to stay on GPU compositor layer */}
      <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <motion.div
          className={`h-full w-full rounded-full origin-left ${barColor}`}
          initial={false}
          animate={{ scaleX: pct }}
          transition={{ duration: 0.28, ease: 'linear' }}
          style={{ willChange: 'transform' }}
        />
      </div>

      {/* Time label */}
      <motion.span
        className={`text-xs font-mono font-bold tabular-nums min-w-[32px] text-right ${textColor}`}
        animate={critical && isMyTurn ? { scale: [1, 1.15, 1] } : {}}
        transition={critical ? { duration: 0.5, repeat: Infinity } : {}}
      >
        {remaining}s
      </motion.span>
    </div>
  )
}
