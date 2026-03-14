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
}

type Tab = 'cards' | 'pile' | 'state'

export default function DevPanel({
  privileges,
  allPlayerHands,
  drawPileCards,
  players,
  game,
  onDeactivate,
}: DevPanelProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [tab, setTab] = useState<Tab>('cards')

  const tabs: { key: Tab; label: string; icon: string; enabled: boolean }[] = [
    { key: 'cards', label: 'All Cards', icon: '🃏', enabled: privileges.canSeeAllCards },
    { key: 'pile', label: 'Draw Pile', icon: '📚', enabled: privileges.canPeekDrawPile },
    { key: 'state', label: 'Game State', icon: '🔍', enabled: privileges.canInspectGameState },
  ]

  const enabledTabs = tabs.filter((t) => t.enabled)

  const gameStateJson = useMemo(() => {
    if (!game) return '{}'
    return JSON.stringify(game, null, 2)
  }, [game])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={SPRING_PANEL}
      className="fixed bottom-4 right-4 z-40"
      style={{ maxWidth: collapsed ? '48px' : '380px', width: collapsed ? '48px' : '380px' }}
    >
      {/* Collapsed state */}
      {collapsed ? (
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setCollapsed(false)}
          className="w-12 h-12 rounded-full bg-amber-600/90 border-2 border-amber-500/60 shadow-lg flex items-center justify-center cursor-pointer hover:bg-amber-500/90 transition-colors"
          title="Expand Dev Panel"
        >
          <span className="text-lg">🛠️</span>
        </motion.button>
      ) : (
        <div className="bg-slate-800/95 backdrop-blur-md border border-amber-600/40 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-amber-900/20 border-b border-amber-600/20">
            <div className="flex items-center gap-2">
              <span className="text-sm">🛠️</span>
              <span className="text-xs font-bold text-amber-300">DEV MODE</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCollapsed(true)}
                className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-[10px]"
                title="Collapse"
              >
                ▼
              </button>
              <button
                onClick={onDeactivate}
                className="px-2 py-1 rounded-md bg-red-900/40 border border-red-700/30 hover:bg-red-900/60 text-red-400 text-[10px] font-semibold transition-colors cursor-pointer"
                title="Deactivate dev mode"
              >
                Exit
              </button>
            </div>
          </div>

          {/* Tabs */}
          {enabledTabs.length > 1 && (
            <div className="flex border-b border-slate-700/50">
              {enabledTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors cursor-pointer ${
                    tab === t.key
                      ? 'text-amber-300 bg-amber-900/15 border-b-2 border-amber-500'
                      : 'text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="p-3 max-h-[50vh] overflow-y-auto">
            <AnimatePresence mode="wait">
              {tab === 'cards' && privileges.canSeeAllCards && (
                <motion.div
                  key="cards"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {Object.entries(allPlayerHands).map(([pid, priv]) => {
                    const player = players[pid]
                    if (!player) return null
                    const color = getPlayerColor(player.seatIndex, player.colorKey)
                    return (
                      <div key={pid} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: color.solid }}
                          />
                          <span className="text-xs font-semibold" style={{ color: color.text }}>
                            {player.displayName}
                          </span>
                        </div>
                        <div className="flex gap-2 pl-4">
                          {priv.hand.map((card, i) => (
                            <CardView
                              key={card?.id ?? i}
                              card={card}
                              faceUp
                              size="sm"
                              label={`#${i + 1}`}
                            />
                          ))}
                          {priv.drawnCard && (
                            <div className="relative">
                              <CardView
                                card={priv.drawnCard}
                                faceUp
                                size="sm"
                                label="Drawn"
                              />
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white">
                                D
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {Object.keys(allPlayerHands).length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No player data available yet.
                    </p>
                  )}
                </motion.div>
              )}

              {tab === 'pile' && privileges.canPeekDrawPile && (
                <motion.div
                  key="pile"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Draw Pile ({drawPileCards.length} cards)
                    </span>
                  </div>
                  {drawPileCards.length > 0 ? (
                    <div className="space-y-1.5">
                      {/* Show top 10 cards */}
                      {drawPileCards.slice(0, 10).map((card, i) => (
                        <div
                          key={card.id}
                          className="flex items-center gap-3 px-2 py-1.5 rounded-lg bg-slate-900/40"
                        >
                          <span className="text-[10px] text-slate-500 w-5 text-right font-mono">
                            {i + 1}.
                          </span>
                          <CardView card={card} faceUp size="sm" />
                          <span className="text-xs text-slate-400">
                            {card.isJoker ? '🃏 Joker' : `${card.rank} of ${card.suit}`}
                          </span>
                          {i === 0 && (
                            <span className="ml-auto text-[9px] px-1.5 py-0.5 bg-amber-600/30 text-amber-300 rounded-full font-bold">
                              NEXT
                            </span>
                          )}
                        </div>
                      ))}
                      {drawPileCards.length > 10 && (
                        <p className="text-[10px] text-slate-500 text-center pt-1">
                          ... and {drawPileCards.length - 10} more cards
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">
                      Draw pile is empty.
                    </p>
                  )}
                </motion.div>
              )}

              {tab === 'state' && privileges.canInspectGameState && (
                <motion.div
                  key="state"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300">Game Document</span>
                    <button
                      onClick={() => navigator.clipboard?.writeText(gameStateJson)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <pre className="text-[10px] text-slate-400 bg-slate-900/60 rounded-lg p-3 overflow-x-auto max-h-[40vh] font-mono leading-relaxed border border-slate-700/30">
                    {gameStateJson}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  )
}
