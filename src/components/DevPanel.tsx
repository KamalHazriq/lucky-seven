import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import CardView from './CardView'
import type { DevPrivileges, PrivatePlayerDoc, Card, GameDoc, PlayerDoc } from '../lib/types'
import { getPlayerColor } from '../lib/playerColors'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card as UICard } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface DevPanelProps {
  open: boolean
  onClose: () => void
  privileges: DevPrivileges
  allPlayerHands: Record<string, PrivatePlayerDoc>
  drawPileCards: Card[]
  players: Record<string, PlayerDoc>
  game: GameDoc | null
  onDeactivate: () => void
  onOpenReorder?: () => void
}

export default function DevPanel({
  open,
  onClose,
  privileges,
  allPlayerHands,
  drawPileCards,
  players,
  game,
  onDeactivate,
  onOpenReorder,
}: DevPanelProps) {
  const [expandedCards, setExpandedCards] = useState(false)
  const [expandedPile, setExpandedPile] = useState(false)
  const [expandedState, setExpandedState] = useState(false)

  const gameStateJson = useMemo(() => {
    if (!game) return '{}'
    return JSON.stringify(game, null, 2)
  }, [game])

  // Turn queue info
  const turnInfo = useMemo(() => {
    if (!game) return null
    const currentPlayer = game.currentTurnPlayerId
    const currentName = currentPlayer ? players[currentPlayer]?.displayName ?? '?' : 'None'
    const phase = game.turnPhase ?? 'idle'
    return { currentName, phase, round: game.playerOrder.length > 0 ? Math.floor((game.actionVersion ?? 0) / game.playerOrder.length) + 1 : 1 }
  }, [game, players])

  // Card distribution
  const cardDistribution = useMemo(() => {
    if (!game) return null
    return {
      drawPile: drawPileCards.length,
      discardTop: game.discardTop ? 1 : 0,
      inHands: Object.values(allPlayerHands).reduce((sum, p) => sum + p.hand.filter(Boolean).length + (p.drawnCard ? 1 : 0), 0),
      players: game.playerOrder.length,
    }
  }, [game, drawPileCards, allPlayerHands])

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[340px] max-w-[85vw] sm:max-w-[340px] p-0 flex flex-col"
      >
        {/* ─── Header ─── */}
        <SheetHeader className="px-4 pt-4 pb-0 gap-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-emerald-900/40 border border-emerald-600/30 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div>
                <SheetTitle className="text-sm tracking-tight">Game Monitor</SheetTitle>
                <SheetDescription className="flex items-center gap-1.5 text-[9px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400/80 font-medium tracking-wide uppercase">Monitor Active</span>
                </SheetDescription>
              </div>
            </div>
            <SheetClose asChild>
              <Button variant="ghost" size="sm" className="ls-close-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>

        <Separator className="mt-3" />

        {/* ─── Tabs ─── */}
        <Tabs defaultValue="visibility" className="flex-1 flex flex-col min-h-0 gap-0">
          <TabsList className="w-full rounded-none border-b border-border-subtle bg-transparent h-10 px-3 pt-1 pb-0">
            <TabsTrigger value="visibility" className="flex-1 gap-1 text-[10px] font-semibold rounded-t-lg rounded-b-none cursor-pointer data-[state=active]:bg-surface-panel data-[state=active]:border data-[state=active]:border-border-subtle data-[state=active]:border-b-transparent">
              <span>👁</span> Visibility
            </TabsTrigger>
            <TabsTrigger value="state" className="flex-1 gap-1 text-[10px] font-semibold rounded-t-lg rounded-b-none cursor-pointer data-[state=active]:bg-surface-panel data-[state=active]:border data-[state=active]:border-border-subtle data-[state=active]:border-b-transparent">
              <span>🧭</span> State
            </TabsTrigger>
            <TabsTrigger value="session" className="flex-1 gap-1 text-[10px] font-semibold rounded-t-lg rounded-b-none cursor-pointer data-[state=active]:bg-surface-panel data-[state=active]:border data-[state=active]:border-border-subtle data-[state=active]:border-b-transparent">
              <span>🧪</span> Session
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 min-h-0">
            {/* ══════ VISIBILITY ══════ */}
            <TabsContent value="visibility" className="px-3 py-3 space-y-2 mt-0">
              {privileges.canSeeAllCards && (
                <ToolCard
                  icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                  title="Inspect Player Cards"
                  desc="View all players' current hands"
                  expanded={expandedCards}
                  onToggle={() => setExpandedCards(!expandedCards)}
                >
                  <div className="space-y-2.5 pt-1">
                    {Object.entries(allPlayerHands).map(([pid, priv]) => {
                      const player = players[pid]
                      if (!player) return null
                      const color = getPlayerColor(player.seatIndex, player.colorKey)
                      return (
                        <div key={pid}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color.solid }} />
                            <span className="text-[10px] font-semibold" style={{ color: color.text }}>{player.displayName}</span>
                            <Badge
                              variant="outline"
                              className={`text-[8px] px-1.5 py-0 ${player.connected ? 'text-emerald-400 border-emerald-600/30' : 'text-red-400 border-red-600/30'}`}
                            >
                              {player.connected ? 'online' : 'offline'}
                            </Badge>
                          </div>
                          <div className="flex gap-1.5 pl-3.5">
                            {priv.hand.map((card, i) => (
                              <CardView key={card?.id ?? i} card={card} faceUp size="sm" label={`#${i + 1}`} />
                            ))}
                            {priv.drawnCard && (
                              <div className="relative">
                                <CardView card={priv.drawnCard} faceUp size="sm" label="Drawn" />
                                <Badge className="absolute -top-1 -right-1 h-3.5 w-3.5 p-0 text-[7px] justify-center bg-amber-500 text-white">D</Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {Object.keys(allPlayerHands).length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-2">No player data available.</p>
                    )}
                  </div>
                </ToolCard>
              )}

              {privileges.canPeekDrawPile && (
                <ToolCard
                  icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 3H8l-2 4h12l-2-4z"/></svg>}
                  title="Inspect Draw Stack"
                  desc={`${drawPileCards.length} cards remaining`}
                  expanded={expandedPile}
                  onToggle={() => setExpandedPile(!expandedPile)}
                >
                  <div className="space-y-0.5 pt-1">
                    {drawPileCards.slice(0, 12).map((card, i) => (
                      <div key={card.id} className={`flex items-center gap-2 px-2 py-1 rounded-lg ${i === 0 ? 'bg-amber-900/15 border border-amber-700/20' : 'bg-surface-panel'}`}>
                        <span className="text-[9px] text-muted-foreground w-4 text-right font-mono">{i + 1}.</span>
                        <CardView card={card} faceUp size="sm" />
                        <span className="text-[10px] text-foreground/80 flex-1">{card.isJoker ? 'Joker' : `${card.rank} of ${card.suit}`}</span>
                        {i === 0 && <Badge className="text-[7px] px-1.5 py-0 bg-amber-600/25 text-amber-300 border-amber-700/20" variant="outline">NEXT</Badge>}
                      </div>
                    ))}
                    {drawPileCards.length > 12 && (
                      <p className="text-[9px] text-muted-foreground text-center pt-1">...and {drawPileCards.length - 12} more</p>
                    )}
                    {drawPileCards.length === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center py-2">Stack is empty.</p>
                    )}
                  </div>
                </ToolCard>
              )}

              {!privileges.canSeeAllCards && !privileges.canPeekDrawPile && (
                <p className="text-[10px] text-muted-foreground text-center py-6">No visibility tools available.</p>
              )}
            </TabsContent>

            {/* ══════ STATE ══════ */}
            <TabsContent value="state" className="px-3 py-3 space-y-2 mt-0">
              {turnInfo && (
                <UICard className="p-3">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Current Turn</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-foreground font-medium">{turnInfo.currentName}</span>
                    <Badge variant="secondary" className="text-[9px] font-mono">{turnInfo.phase}</Badge>
                  </div>
                </UICard>
              )}

              {cardDistribution && (
                <UICard className="p-3">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">Card Distribution</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    <StatRow label="Draw stack" value={cardDistribution.drawPile} />
                    <StatRow label="Discard top" value={cardDistribution.discardTop} />
                    <StatRow label="In hands" value={cardDistribution.inHands} />
                    <StatRow label="Players" value={cardDistribution.players} />
                  </div>
                </UICard>
              )}

              {privileges.canInspectGameState && (
                <ToolCard
                  icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>}
                  title="Game State Document"
                  desc="Full JSON representation"
                  expanded={expandedState}
                  onToggle={() => setExpandedState(!expandedState)}
                  action={
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-[8px] text-muted-foreground hover:text-cyan-300"
                          onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(gameStateJson) }}
                        >
                          Copy
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" sideOffset={4}>
                        <p>Copy JSON to clipboard</p>
                      </TooltipContent>
                    </Tooltip>
                  }
                >
                  <pre className="text-[8px] text-muted-foreground bg-black/20 rounded-lg p-2 overflow-x-auto max-h-[30vh] font-mono leading-relaxed mt-1 border border-border-subtle">
                    {gameStateJson}
                  </pre>
                </ToolCard>
              )}

              {privileges.canReorderDiscardPile && onOpenReorder && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto px-3 py-2.5 rounded-xl border-amber-700/20 bg-amber-900/10 hover:bg-amber-900/20 text-left group"
                  onClick={() => { onOpenReorder(); onClose() }}
                >
                  <div className="w-7 h-7 rounded-lg bg-amber-900/30 border border-amber-600/20 flex items-center justify-center shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                      <polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-semibold text-amber-300 block">Reorder Draw Stack</span>
                    <span className="text-[9px] text-amber-500/50">Rearrange card positions</span>
                  </div>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-amber-400 ml-auto transition-colors shrink-0">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </Button>
              )}
            </TabsContent>

            {/* ══════ SESSION ══════ */}
            <TabsContent value="session" className="px-3 py-3 space-y-2.5 mt-0">
              <UICard className="p-3">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold mb-2.5">Active Permissions</p>
                <div className="flex flex-wrap gap-1.5">
                  {privileges.canSeeAllCards && <Badge variant="outline" className="text-[9px] border-border-subtle text-muted-foreground">Inspect Cards</Badge>}
                  {privileges.canPeekDrawPile && <Badge variant="outline" className="text-[9px] border-border-subtle text-muted-foreground">Draw Stack</Badge>}
                  {privileges.canInspectGameState && <Badge variant="outline" className="text-[9px] border-border-subtle text-muted-foreground">Game State</Badge>}
                  {privileges.canUseCheatActions && <Badge variant="outline" className="text-[9px] border-border-subtle text-muted-foreground">Actions</Badge>}
                  {privileges.canReorderDiscardPile && <Badge variant="outline" className="text-[9px] border-amber-700/30 text-amber-300 bg-amber-900/20">Reorder</Badge>}
                </div>
              </UICard>

              <UICard className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-semibold text-emerald-300">Session Active</span>
                </div>
                <p className="text-[9px] text-muted-foreground pl-4">
                  Monitor mode is bound to this game session. Leaving or refreshing will preserve access.
                </p>
              </UICard>

              <Button
                variant="danger"
                className="w-full h-10 rounded-xl text-[11px] font-semibold"
                onClick={() => { onDeactivate(); onClose() }}
              >
                Disable Monitor Mode
              </Button>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

/* ─── Reusable sub-components ─── */

function ToolCard({ icon, title, desc, expanded, onToggle, action, children }: {
  icon: React.ReactNode
  title: string
  desc: string
  expanded: boolean
  onToggle: () => void
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <UICard className="p-0 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-panel/80 transition-colors cursor-pointer"
      >
        <div className="w-7 h-7 rounded-lg bg-surface-panel border border-border-subtle flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="text-left flex-1 min-w-0">
          <span className="text-[11px] font-semibold text-foreground block">{title}</span>
          <span className="text-[9px] text-muted-foreground">{desc}</span>
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.4 }}
            className="overflow-hidden"
          >
            <Separator />
            <div className="px-3 py-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </UICard>
  )
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-[10px] text-foreground font-mono font-medium">{value}</span>
    </div>
  )
}
