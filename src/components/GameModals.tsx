import DrawnCardModal from './DrawnCardModal'
import PeekModal from './PeekModal'
import PeekResultModal from './PeekResultModal'
import PeekAllModal from './PeekAllModal'
import QueenSwapModal from './QueenSwapModal'
import SlotPickerModal from './SlotPickerModal'
import JokerChaosModal from './JokerChaosModal'
import PowerGuideModal from './PowerGuideModal'
import SettingsModal from './SettingsModal'
import DevModeModal from './DevModeModal'
import DevPanel from './DevPanel'
import type { ModalState } from '../hooks/useGameActions'
import type { Card, GameDoc, PlayerDoc, PowerEffectType, PowerRankKey, DrawnCardSource, DevPrivileges, PrivatePlayerDoc } from '../lib/types'
import type { DEFAULT_GAME_SETTINGS } from '../lib/types'

interface GameModalsProps {
  // Modal state
  modal: ModalState
  setModal: React.Dispatch<React.SetStateAction<ModalState>>

  // Game data
  game: GameDoc
  players: Record<string, PlayerDoc>
  localPlayerId: string
  modalPlayerOrder: string[]

  // Card/power data
  isMyTurn: boolean
  hasDrawnCard: boolean
  drawnCard: Card | null
  myLocks: [boolean, boolean, boolean]
  myKnown: Record<string, Card>
  powerAssignments: typeof DEFAULT_GAME_SETTINGS.powerAssignments
  spentPowerCardIds: Record<string, boolean>
  drawnCardSource: DrawnCardSource
  hasAnyLocks: boolean
  uiMode: 'modal' | 'actionbar'
  drawnCardDismissed: boolean

  // Handlers
  onSwap: (slotIndex: number) => void
  onDiscard: () => void
  onUsePower: (rankKey: PowerRankKey, effectType: PowerEffectType) => void
  onCancelDraw: () => void
  onDismissDrawn: () => void
  onPeekSelect: (slotIndex: number) => void
  onSwapConfirm: (a: { playerId: string; slotIndex: number }, b: { playerId: string; slotIndex: number }) => void
  onLockSelect: (playerId: string, slotIndex: number) => void
  onUnlockSelect: (playerId: string, slotIndex: number) => void
  onRearrangeSelect: (playerId: string) => void
  onPeekOpponentSelect: (playerId: string, slotIndex: number) => void
  onCancelPower: () => void

  // Power guide
  showPowerGuide: boolean
  onClosePowerGuide: () => void

  // Settings
  showSettings: boolean
  onCloseSettings: () => void
  layout: 'table' | 'classic'
  onToggleLayout: () => void
  uiModeValue: 'modal' | 'actionbar'
  onToggleUiMode: () => void
  logPosition: 'bottom' | 'left'
  onToggleLogPosition: () => void
  isMobile: boolean
  canLogSidebar: boolean
  otherPlayers: string[]
  voteKickActive: boolean
  onVoteKick: (targetId: string) => void
  onLeaveGame: () => void

  // Dev mode
  showDevModal: boolean
  onCloseDevModal: () => void
  devMode: {
    activate: (code: string) => Promise<void>
    loading: boolean
    error: string | null
    isDevMode: boolean
    privileges: DevPrivileges | null
    allPlayerHands: Record<string, PrivatePlayerDoc>
    drawPileCards: Card[]
    deactivate: () => Promise<void>
  }
}

export default function GameModals({
  modal, setModal,
  game, players, localPlayerId, modalPlayerOrder,
  isMyTurn, hasDrawnCard, drawnCard,
  myLocks, myKnown, powerAssignments, spentPowerCardIds, drawnCardSource,
  hasAnyLocks, uiMode, drawnCardDismissed,
  onSwap, onDiscard, onUsePower, onCancelDraw, onDismissDrawn,
  onPeekSelect, onSwapConfirm, onLockSelect, onUnlockSelect, onRearrangeSelect, onPeekOpponentSelect, onCancelPower,
  showPowerGuide, onClosePowerGuide,
  showSettings, onCloseSettings,
  layout, onToggleLayout, uiModeValue, onToggleUiMode,
  logPosition, onToggleLogPosition, isMobile, canLogSidebar,
  otherPlayers, voteKickActive, onVoteKick, onLeaveGame,
  showDevModal, onCloseDevModal, devMode,
}: GameModalsProps) {
  return (
    <>
      {/* Drawn Card Modal (main action chooser) — only in modal UI mode */}
      <DrawnCardModal
        card={uiMode === 'modal' && isMyTurn && hasDrawnCard ? drawnCard : null}
        open={modal.type === 'none' && !drawnCardDismissed}
        locks={myLocks}
        powerAssignments={powerAssignments}
        spentPowerCardIds={spentPowerCardIds}
        knownCards={myKnown}
        drawnCardSource={drawnCardSource}
        onSwap={onSwap}
        onDiscard={onDiscard}
        onUsePower={onUsePower}
        onClose={onCancelDraw}
        onDismiss={onDismissDrawn}
        hasAnyLocks={hasAnyLocks}
      />

      <PeekModal
        open={modal.type === 'peekOne'}
        onSelect={onPeekSelect}
        onCancel={onCancelPower}
      />

      <PeekResultModal
        card={modal.type === 'peekResult' ? modal.card : null}
        slotIndex={modal.type === 'peekResult' ? modal.slot : null}
        onClose={() => setModal({ type: 'none' })}
      />

      <PeekAllModal
        open={modal.type === 'peekAll'}
        revealedCards={modal.type === 'peekAll' ? modal.cards : {}}
        locks={myLocks}
        onClose={() => setModal({ type: 'none' })}
      />

      <QueenSwapModal
        open={modal.type === 'swap'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        onConfirm={onSwapConfirm}
        onCancel={onCancelPower}
      />

      <SlotPickerModal
        open={modal.type === 'lock'}
        title="Power: Lock"
        subtitle="Choose an unlocked card to lock. Locked cards cannot be swapped."
        accentColor="red"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        slotFilter={(_pid: string, slotIndex: number, pd: PlayerDoc) => !pd.locks[slotIndex]}
        onSelect={onLockSelect}
        onCancel={onCancelPower}
      />

      <SlotPickerModal
        open={modal.type === 'unlock'}
        title="Power: Unlock"
        subtitle="Choose a locked card to unlock."
        accentColor="cyan"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        slotFilter={(_pid: string, slotIndex: number, pd: PlayerDoc) => pd.locks[slotIndex]}
        onSelect={onUnlockSelect}
        onCancel={onCancelPower}
        noTargetsMessage="No cards are locked."
      />

      <SlotPickerModal
        open={modal.type === 'peekOpponent'}
        title="Power: Peek Opponent"
        subtitle="Choose an opponent's card to peek."
        accentColor="amber"
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        knownCards={myKnown}
        slotFilter={(pid: string, slotIndex: number, pd: PlayerDoc) => pid !== localPlayerId && !pd.locks[slotIndex]}
        onSelect={onPeekOpponentSelect}
        onCancel={onCancelPower}
        noTargetsMessage="No opponent cards available to peek."
      />

      <PeekResultModal
        card={modal.type === 'peekOpponentResult' ? modal.card : null}
        slotIndex={modal.type === 'peekOpponentResult' ? modal.slot : null}
        onClose={() => setModal({ type: 'none' })}
      />

      <JokerChaosModal
        open={modal.type === 'rearrange'}
        players={players}
        playerOrder={modalPlayerOrder}
        localPlayerId={localPlayerId}
        onSelect={onRearrangeSelect}
        onCancel={onCancelPower}
      />

      <PowerGuideModal
        open={showPowerGuide}
        onClose={onClosePowerGuide}
        powerAssignments={powerAssignments}
      />

      <SettingsModal
        open={showSettings}
        onClose={onCloseSettings}
        layout={layout}
        onToggleLayout={onToggleLayout}
        uiMode={uiModeValue}
        onToggleUiMode={onToggleUiMode}
        logPosition={logPosition}
        onToggleLogPosition={onToggleLogPosition}
        showLayoutToggle={!isMobile}
        showUiModeToggle={!isMobile}
        showLogToggle={canLogSidebar}
        onVoteKick={onVoteKick}
        otherPlayers={otherPlayers.map((pid) => ({ id: pid, name: players[pid]?.displayName ?? 'Unknown' }))}
        voteKickActive={voteKickActive}
        onLeaveGame={onLeaveGame}
      />

      {/* Dev Mode Modal + Panel */}
      <DevModeModal
        open={showDevModal}
        onClose={onCloseDevModal}
        onActivate={devMode.activate}
        loading={devMode.loading}
        error={devMode.error}
      />
      {devMode.isDevMode && devMode.privileges && (
        <DevPanel
          privileges={devMode.privileges}
          allPlayerHands={devMode.allPlayerHands}
          drawPileCards={devMode.drawPileCards}
          players={players}
          game={game}
          onDeactivate={devMode.deactivate}
        />
      )}
    </>
  )
}
