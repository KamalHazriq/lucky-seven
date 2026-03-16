import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import CardView from './CardView'
import type { DevPrivileges, PrivatePlayerDoc, Card, GameDoc, PlayerDoc } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'

const SPRING_PANEL = { type: 'spring' as const, stiffness: 300, damping: 26, mass: 0.7 }

interface DevPanelProps {
  privileges: DevPrivileges
  allPlayerHands: Record<string, PrivatePlayerDoc>
  drawPileCards: Card[]
  players: Record<string, PlayerDoc>
  game: GameDoc | null
  onDeactivate: () => void
  onOpenReorder?: () => void
}

type Section = 'visibility' | 'debug' | 'session'

export default function DevPanel({
  privileges,
  allPlayerHands,
  drawPileCards,
  players,
  game,
  onDeactivate,
  onOpenReorder,
}: DevPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('visibility')
  const [showAllCards, setShowAllCards] = useState(false)
  const [showDrawPile, setShowDrawPile] = useState(false)
  const [showGameState, setShowGameState] = useState(false)

  const gameStateJson = useMemo(() => {
    if (!game) return '{}'
    return JSON.stringify(game, null, 2)
  }, [game])

  const sections: { key: Section; label: string; icon: string }[] = [
    { key: 'visibility', label: 'Visibility', icon: '👁' },
    { key: 'debug', label: 'Debug', icon: '🔧' },
    { key: 'session', label: 'Session', icon: '🔑' },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, x: 20, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 20, scale: 0.95 }}
      transition={SPRING_PANEL}
      className="fixed bottom-4 right-4 z-40"
      style={{ maxWidth: collapsed ? '48px' : '360px', width: collapsed ? '48px' : '360px' }}
    >
      {/* Collapsed FAB */}
      {collapsed ? (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setCollapsed(false)}
          className="w-11 h-11 rounded-full bg-amber-600/90 border border-amber-500/60 shadow-lg flex items-center justify-center cursor-pointer hover:bg-amber-500/90 transition-colors"
          title="Developer Tools"
        >
          <span className="text-sm">🛠️</span>
        </motion.button>
      ) : (
        <div className="bg-slate-900/95 backdrop-blur-md border border-amber-600/30 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-amber-900/15 border-b border-amber-600/15">
            <div className="flex items-center gap-2">
              <span className="text-xs">🛠️</span>
              <span className="text-[11px] font-bold text-amber-300 tracking-wide">DEV TOOLS</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCollapsed(true)}
                className="w-5 h-5 flex items-center justify-center rounded bg-slate-800/60 hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors cursor-pointer text-[9px]"
                title="Minimize"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Section tabs */}
          <div className="flex border-b border-slate-800/80">
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveSection(s.key)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
                  activeSection === s.key
                    ? 'text-amber-300 bg-amber-900/10 border-b border-amber-500'
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                <span className="text-[10px]">{s.icon}</span>
                {s.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="max-h-[55vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {/* ─── VISIBILITY SECTION ─── */}
              {activeSection === 'visibility' && (
                <motion.div
                  key="visibility"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-2.5 space-y-1.5"
                >
                  {/* See All Cards */}
                  {privileges.canSeeAllCards && (
                    <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                      <button
                        onClick={() => setShowAllCards(!showAllCards)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800/80 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]">🃏</span>
                          <div className="text-left">
                            <span className="text-[11px] font-semibold text-slate-200 block">All Player Cards</span>
                            <span className="text-[9px] text-slate-500">View every player's hand</span>
                          </div>
                        </div>
                        <span className={`text-[9px] text-slate-500 transition-transform ${showAllCards ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {showAllCards && (
                        <div className="p-2.5 border-t border-slate-700/30 space-y-2.5">
                          {Object.entries(allPlayerHands).map(([pid, priv]) => {
                            const player = players[pid]
                            if (!player) return null
                            const color = getPlayerColor(player.seatIndex, player.colorKey)
                            return (
                              <div key={pid} className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color.solid }} />
                                  <span className="text-[10px] font-semibold" style={{ color: color.text }}>
                                    {player.displayName}
                                  </span>
                                </div>
                                <div className="flex gap-1.5 pl-3">
                                  {priv.hand.map((card, i) => (
                                    <CardView key={card?.id ?? i} card={card} faceUp size="sm" label={`#${i + 1}`} />
                                  ))}
                                  {priv.drawnCard && (
                                    <div className="relative">
                                      <CardView card={priv.drawnCard} faceUp size="sm" label="Drawn" />
                                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center text-[7px] font-bold text-white">D</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {Object.keys(allPlayerHands).length === 0 && (
                            <p className="text-[10px] text-slate-500 text-center py-2">No player data yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Draw Pile */}
                  {privileges.canPeekDrawPile && (
                    <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                      <button
                        onClick={() => setShowDrawPile(!showDrawPile)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800/80 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]">📚</span>
                          <div className="text-left">
                            <span className="text-[11px] font-semibold text-slate-200 block">Draw Pile</span>
                            <span className="text-[9px] text-slate-500">{drawPileCards.length} cards remaining</span>
                          </div>
                        </div>
                        <span className={`text-[9px] text-slate-500 transition-transform ${showDrawPile ? 'rotate-180' : ''}`}>▼</span>
                      </button>
                      {showDrawPile && (
                        <div className="p-2.5 border-t border-slate-700/30 space-y-1">
                          {drawPileCards.slice(0, 10).map((card, i) => (
                            <div key={card.id} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-900/30">
                              <span className="text-[9px] text-slate-500 w-4 text-right font-mono">{i + 1}.</span>
                              <CardView card={card} faceUp size="sm" />
                              <span className="text-[10px] text-slate-400 flex-1">
                                {card.isJoker ? 'Joker' : `${card.rank} of ${card.suit}`}
                              </span>
                              {i === 0 && (
                                <span className="text-[8px] px-1.5 py-0.5 bg-amber-600/25 text-amber-300 rounded-full font-bold">NEXT</span>
                              )}
                            </div>
                          ))}
                          {drawPileCards.length > 10 && (
                            <p className="text-[9px] text-slate-500 text-center pt-1">...{drawPileCards.length - 10} more</p>
                          )}
                          {drawPileCards.length === 0 && (
                            <p className="text-[10px] text-slate-500 text-center py-2">Draw pile is empty.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ─── DEBUG SECTION ─── */}
              {activeSection === 'debug' && (
                <motion.div
                  key="debug"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-2.5 space-y-1.5"
                >
                  {/* Inspect Game State */}
                  {privileges.canInspectGameState && (
                    <div className="rounded-xl border border-slate-700/40 overflow-hidden">
                      <button
                        onClick={() => setShowGameState(!showGameState)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/50 hover:bg-slate-800/80 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-[11px]">🔍</span>
                          <div className="text-left">
                            <span className="text-[11px] font-semibold text-slate-200 block">Game State</span>
                            <span className="text-[9px] text-slate-500">Full game document JSON</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(gameStateJson) }}
                            className="text-[9px] text-slate-500 hover:text-amber-300 px-1.5 py-0.5 rounded bg-slate-800/60 hover:bg-slate-700/60 transition-colors cursor-pointer"
                          >
                            Copy
                          </button>
                          <span className={`text-[9px] text-slate-500 transition-transform ${showGameState ? 'rotate-180' : ''}`}>▼</span>
                        </div>
                      </button>
                      {showGameState && (
                        <div className="border-t border-slate-700/30">
                          <pre className="text-[9px] text-slate-400 bg-slate-950/60 p-2.5 overflow-x-auto max-h-[35vh] font-mono leading-relaxed">
                            {gameStateJson}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reorder Draw Pile */}
                  {privileges.canReorderDiscardPile && onOpenReorder && (
                    <button
                      onClick={onOpenReorder}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-amber-700/30 bg-amber-900/10 hover:bg-amber-900/20 transition-colors cursor-pointer"
                    >
                      <span className="text-[11px]">🔀</span>
                      <div className="text-left">
                        <span className="text-[11px] font-semibold text-amber-300 block">Reorder Draw Pile</span>
                        <span className="text-[9px] text-amber-500/60">Move cards to change draw order</span>
                      </div>
                    </button>
                  )}

                  {!privileges.canInspectGameState && !privileges.canReorderDiscardPile && (
                    <p className="text-[10px] text-slate-500 text-center py-4">No debug tools available.</p>
                  )}
                </motion.div>
              )}

              {/* ─── SESSION SECTION ─── */}
              {activeSection === 'session' && (
                <motion.div
                  key="session"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="p-2.5 space-y-2"
                >
                  {/* Status */}
                  <div className="rounded-xl border border-slate-700/40 px-3 py-2.5 bg-slate-800/40">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-[11px] font-semibold text-emerald-300">Dev Mode Active</span>
                    </div>
                    <div className="space-y-1">
                      {privileges.canSeeAllCards && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-emerald-400">✓</span>
                          <span className="text-[9px] text-slate-400">See all cards</span>
                        </div>
                      )}
                      {privileges.canPeekDrawPile && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-emerald-400">✓</span>
                          <span className="text-[9px] text-slate-400">Peek draw pile</span>
                        </div>
                      )}
                      {privileges.canInspectGameState && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-emerald-400">✓</span>
                          <span className="text-[9px] text-slate-400">Inspect game state</span>
                        </div>
                      )}
                      {privileges.canUseCheatActions && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-emerald-400">✓</span>
                          <span className="text-[9px] text-slate-400">Cheat actions</span>
                        </div>
                      )}
                      {privileges.canReorderDiscardPile && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-amber-400">★</span>
                          <span className="text-[9px] text-amber-300">Reorder draw pile (owner)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Revoke */}
                  <button
                    onClick={onDeactivate}
                    className="w-full py-2 rounded-xl bg-red-900/20 border border-red-700/30 hover:bg-red-900/40 text-red-400 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Revoke Dev Mode
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  )
}
