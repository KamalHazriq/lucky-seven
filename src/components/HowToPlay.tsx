import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function HowToPlay() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 cursor-pointer transition-colors"
      >
        How to Play
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-800 border border-slate-600 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto"
            >
              <h2 className="text-2xl font-bold text-amber-300 mb-4 text-center">
                How to Play Lucky Seven
              </h2>

              <div className="space-y-4 text-sm text-slate-300">
                {/* Goal */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Goal</h3>
                  <p>
                    Have the <span className="text-amber-300 font-medium">lowest total score</span> when the game ends.
                    Each player has 3 face-down cards. You can peek, swap, and use powers to improve your hand.
                  </p>
                </section>

                {/* Card values */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Card Values</h3>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400">
                    <li><span className="text-amber-300 font-medium">7 = 0 points</span> (the best!)</li>
                    <li>Ace = 1 point</li>
                    <li>2-6, 8-9 = face value</li>
                    <li>10, J, Q, K, Joker = 10 points (but they have powers!)</li>
                  </ul>
                </section>

                {/* Turns */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">On Your Turn</h3>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400">
                    <li><span className="text-slate-200">Draw</span> from the draw pile or take the top discard.</li>
                    <li><span className="text-slate-200">Then choose one:</span></li>
                  </ol>
                  <ul className="list-disc list-inside ml-4 mt-1 space-y-0.5 text-slate-400">
                    <li><span className="text-slate-200">Swap</span> the drawn card with one of your 3 cards (the old card goes to discard).</li>
                    <li><span className="text-slate-200">Discard</span> the drawn card.</li>
                    <li><span className="text-slate-200">Use its power</span> (if it has one), then discard it.</li>
                  </ul>
                </section>

                {/* Powers */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Power Cards</h3>
                  <p className="text-xs text-slate-400 mb-2">
                    Cards 10, J, Q, K, and Joker have special powers. By default:
                  </p>
                  <div className="space-y-2">
                    <div className="bg-slate-900/50 rounded-lg p-2.5">
                      <span className="font-medium text-amber-400">Jack &mdash; Peek All</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Peek at all 3 of your face-down cards (locked slots cannot be peeked).
                      </p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5">
                      <span className="font-medium text-purple-400">Queen &mdash; Swap</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Swap any two unlocked cards between any players (including your own).
                      </p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5">
                      <span className="font-medium text-red-400">King &mdash; Lock</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Lock any unlocked card (any player). Shows who locked it on hover.
                      </p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5">
                      <span className="font-medium text-cyan-400">10 &mdash; Unlock</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Unlock a locked card (any player). If no cards are locked, power fizzles.
                      </p>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg p-2.5">
                      <span className="font-medium text-fuchsia-400">Joker &mdash; Rearrange</span>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Randomly shuffle another player's unlocked cards.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Ending */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Ending the Game</h3>
                  <p className="text-slate-400">
                    The game ends when the <span className="text-amber-300 font-medium">pile of cards reaches 0</span> or
                    when the pile is fully finished. Once this happens, all players reveal their cards and the scores are
                    calculated. The player with the <span className="text-emerald-300">lowest total score wins</span>.
                  </p>
                </section>

                {/* Locks */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Locked Cards</h3>
                  <p className="text-slate-400">
                    Cards locked by a King show a <span className="text-red-400">King overlay with lock icon</span>.
                    Hover or long-press to see who locked it.
                    They cannot be swapped (by you, Queen, or Joker) or peeked (Jack). Use a 10 to unlock them.
                  </p>
                </section>

                {/* Power usage */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Power Usage</h3>
                  <p className="text-slate-400">
                    Each <span className="text-amber-300 font-medium">physical card</span> can have its power used only once.
                    If you discard a power card without using it, it stays <span className="text-slate-200">unspent</span> &mdash;
                    anyone who takes it from discard can still use its power.
                    Once spent, the power button is disabled for that card.
                    A different card of the same rank has its own independent power.
                  </p>
                </section>

                {/* Settings */}
                <section>
                  <h3 className="font-semibold text-emerald-400 mb-1">Custom Settings</h3>
                  <p className="text-slate-400">
                    When creating a game, open <span className="text-slate-200 font-medium">Power Settings</span> to customize:
                    assign any effect to any power-card rank, and choose the number of Jokers (1-4).
                  </p>
                </section>
              </div>

              <button
                onClick={() => setOpen(false)}
                className="w-full mt-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-sm font-medium transition-colors cursor-pointer"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
