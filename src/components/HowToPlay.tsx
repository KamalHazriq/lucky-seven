import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

export default function HowToPlay({ variant = 'link' }: { variant?: 'link' | 'large' }) {
  const [open, setOpen] = useState(false)

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="relative bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[88vh] overflow-y-auto overscroll-contain"
          >
            {/* Header */}
            <div className="sticky top-0 z-20 bg-slate-800 border-b border-slate-700/50 rounded-t-2xl px-5 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
              <h2 className="text-xl sm:text-2xl font-bold text-amber-300">
                Lucky Seven Rulebook
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-slate-700/50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="p-5 sm:p-6 pb-8 space-y-5 text-sm text-slate-300">
              {/* Top 2-col: Overview + Basic Gameplay side-by-side on desktop */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Game Overview */}
                <section>
                  <h3 className="font-bold text-emerald-400 text-base mb-2">Game Overview</h3>
                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 space-y-2 text-slate-400 h-full">
                    <p>Lucky Seven is a strategic card game where players aim for the <span className="text-amber-300 font-medium">lowest score</span>.</p>
                    <ul className="space-y-1">
                      <li><span className="text-slate-300 font-medium">Players:</span> 2-8 players</li>
                      <li><span className="text-slate-300 font-medium">Objective:</span> Lowest total score wins</li>
                      <li><span className="text-slate-300 font-medium">Hand:</span> 3 face-down cards each</li>
                      <li><span className="text-slate-300 font-medium">End:</span> Draw pile runs out</li>
                    </ul>
                  </div>
                </section>

                {/* Basic Gameplay */}
                <section>
                  <h3 className="font-bold text-emerald-400 text-base mb-2">Basic Gameplay</h3>
                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 space-y-3 text-slate-400 h-full">
                    <div>
                      <p className="text-slate-300 font-medium mb-1.5">Turn Structure:</p>
                      <ol className="list-decimal list-inside space-y-1 ml-1">
                        <li>Draw from pile <span className="text-slate-500">OR</span> take discard</li>
                        <li>Choose: <span className="text-slate-300">Swap</span>, <span className="text-slate-300">Discard</span>, or <span className="text-slate-300">Use Power</span></li>
                        <li>Old card goes to discard pile</li>
                        <li>Turn passes to next player</li>
                      </ol>
                    </div>
                    <div className="border-t border-slate-700/50 pt-2">
                      <p className="text-slate-300 font-medium mb-1">Card Values:</p>
                      <ul className="space-y-0.5 ml-1 text-xs">
                        <li><span className="text-amber-300 font-medium">7 = 0 pts</span> (best card!)</li>
                        <li>A = 1, 2-6 &amp; 8-9 = face value</li>
                        <li>10, J, Q, K, Joker = 10 pts (with powers)</li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>

              {/* Power Cards — 2-col grid */}
              <section>
                <h3 className="font-bold text-emerald-400 text-base mb-2">Power Cards</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3.5 border-l-[3px] border-l-amber-400">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-amber-400">Jack</span>
                      <span className="text-slate-500 text-xs">Peek All</span>
                    </div>
                    <p className="text-slate-400 text-xs">View all 3 of your face-down cards</p>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3.5 border-l-[3px] border-l-purple-400">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-purple-400">Queen</span>
                      <span className="text-slate-500 text-xs">Swap</span>
                    </div>
                    <p className="text-slate-400 text-xs">Swap any two unlocked cards between players</p>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3.5 border-l-[3px] border-l-red-400">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-red-400">King</span>
                      <span className="text-slate-500 text-xs">Lock</span>
                    </div>
                    <p className="text-slate-400 text-xs">Lock any card — prevents swapping</p>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3.5 border-l-[3px] border-l-cyan-400">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-cyan-400">10</span>
                      <span className="text-slate-500 text-xs">Unlock</span>
                    </div>
                    <p className="text-slate-400 text-xs">Unlock a previously locked card</p>
                  </div>

                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-3.5 border-l-[3px] border-l-fuchsia-400 sm:col-span-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-fuchsia-400">Joker</span>
                      <span className="text-slate-500 text-xs">Chaos</span>
                    </div>
                    <p className="text-slate-400 text-xs">Randomly shuffle an opponent's unlocked cards</p>
                  </div>
                </div>
              </section>

              {/* Bottom 2-col: Locked Cards + Strategy */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <section>
                  <h3 className="font-bold text-emerald-400 text-base mb-2">Locked Cards</h3>
                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 text-slate-400 h-full">
                    <ul className="space-y-1.5">
                      <li>Locked cards can't be swapped or peeked</li>
                      <li>Shows a <span className="text-red-400 font-medium">lock icon</span> overlay</li>
                      <li>Use a <span className="text-cyan-400 font-medium">10</span> to unlock them</li>
                      <li>Hover or long-press to see who locked it</li>
                    </ul>
                  </div>
                </section>

                <section>
                  <h3 className="font-bold text-emerald-400 text-base mb-2">Strategy Tips</h3>
                  <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl p-4 text-slate-400 h-full">
                    <ul className="space-y-1.5 list-disc list-inside">
                      <li>Track which cards you've peeked</li>
                      <li><span className="text-amber-300 font-medium">7s = 0 pts</span> — lock them!</li>
                      <li>Queen swap to give opponents high cards</li>
                      <li>Joker chaos disrupts peeked knowledge</li>
                      <li>Sometimes discarding a power is better</li>
                    </ul>
                  </div>
                </section>
              </div>

              {/* How to Win */}
              <section>
                <div className="bg-slate-900/40 border border-amber-600/20 rounded-xl p-4 text-slate-400">
                  <h3 className="font-bold text-amber-300 text-base mb-1.5">How to Win</h3>
                  <ul className="space-y-1">
                    <li>Have the <span className="text-amber-300 font-medium">lowest total score</span> when the draw pile runs out</li>
                    <li><span className="text-amber-300 font-medium">7s</span> are your best friend (0 points each)</li>
                    <li>Strategic use of powers gives you the edge</li>
                  </ul>
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <>
      {variant === 'large' ? (
        <motion.button
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          onClick={() => setOpen(true)}
          className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl font-semibold text-lg transition-all shadow-lg shadow-amber-600/20 cursor-pointer flex items-center justify-center gap-2"
        >
          <span className="text-xl">{'\u{1F4D6}'}</span>
          How to Play
        </motion.button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 cursor-pointer transition-colors"
        >
          How to Play
        </button>
      )}

      {createPortal(modal, document.body)}
    </>
  )
}
