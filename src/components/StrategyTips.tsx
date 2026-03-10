import { motion } from 'framer-motion'

const springEntry = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }

const tips = [
  { emoji: '\u{1F440}', title: 'Peek Early', desc: 'Know your cards before making moves.' },
  { emoji: '\u{1F501}', title: 'Swap Smart', desc: 'Trade high cards with opponents.' },
  { emoji: '\u{1F512}', title: 'Lock Strategically', desc: 'Protect your sevens and low cards.' },
  { emoji: '7\uFE0F\u20E3', title: 'Sevens = Zero', desc: 'Always keep your sevens safe.' },
]

/**
 * StrategyTips — placeholder section for the Home page.
 * Shows a few basic tips with a "Coming Soon" badge for full tips.
 */
export default function StrategyTips() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.9, ...springEntry }}
      className="mt-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">{'\u{1F4A1}'}</span>
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Strategy Tips</h3>
        <span className="px-1.5 py-0.5 bg-amber-900/30 border border-amber-600/30 text-amber-400 rounded-full text-[9px] font-bold">
          Coming Soon
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tips.map((tip, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95 + i * 0.06, ...springEntry }}
            whileHover={{ scale: 1.03, y: -1 }}
            className="flex items-start gap-2 p-2.5 rounded-xl bg-slate-900/40 border border-slate-700/40"
          >
            <span className="text-base shrink-0 mt-0.5">{tip.emoji}</span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-200">{tip.title}</p>
              <p className="text-[10px] text-slate-500 leading-snug">{tip.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
