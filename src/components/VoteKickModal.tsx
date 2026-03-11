import { motion, AnimatePresence } from 'framer-motion'
import type { VoteKick } from '../lib/types'

interface Props {
  voteKick: VoteKick | null
  localPlayerId: string
  onVoteYes: () => void
  onVoteNo: () => void
}

const springBounce = { type: 'spring' as const, stiffness: 400, damping: 22, mass: 0.7 }

export default function VoteKickModal({ voteKick, localPlayerId, onVoteYes, onVoteNo }: Props) {
  if (!voteKick?.active) return null

  const isTarget = localPlayerId === voteKick.targetId
  const alreadyVoted = voteKick.votes.includes(localPlayerId)
  const canVote = !isTarget && !alreadyVoted

  return (
    <AnimatePresence>
      {voteKick.active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Vote to kick player"
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={springBounce}
            className="bg-slate-800 border border-slate-700/60 rounded-2xl p-5 w-full max-w-xs shadow-2xl"
          >
            <div className="text-center mb-4">
              <div className="text-2xl mb-2">{'\u{1F6AB}'}</div>
              <h3 className="text-lg font-bold text-red-400 mb-1">Vote to Kick</h3>
              <p className="text-sm text-slate-300">
                {isTarget
                  ? 'A vote to kick you is in progress...'
                  : <>Kick <span className="font-bold text-white">{voteKick.targetName}</span>?</>
                }
              </p>
            </div>

            {/* Vote progress */}
            <div className="bg-slate-900/50 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span>Votes</span>
                <span
                  className="font-mono"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={`${voteKick.votes.length} of ${voteKick.requiredVotes} votes`}
                >
                  {voteKick.votes.length}/{voteKick.requiredVotes}
                </span>
              </div>
              <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                <motion.div
                  className="h-full w-full bg-red-500 rounded-full origin-left"
                  initial={false}
                  animate={{ scaleX: voteKick.votes.length / voteKick.requiredVotes }}
                  transition={{ duration: 0.3 }}
                  style={{ willChange: 'transform' }}
                />
              </div>
            </div>

            {isTarget ? (
              <p className="text-xs text-slate-500 text-center">
                Waiting for other players to vote...
              </p>
            ) : alreadyVoted ? (
              <p className="text-xs text-emerald-400 text-center font-medium">
                {'\u2713'} You voted — waiting for others...
              </p>
            ) : canVote ? (
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onVoteYes}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                >
                  Kick
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onVoteNo}
                  className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl font-semibold text-sm transition-colors cursor-pointer"
                >
                  Keep
                </motion.button>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
