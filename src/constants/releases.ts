export const CURRENT_VERSION = 'v1.8.0'

export interface ReleaseNote {
  version: string
  title: string
  date: string
  sections: { heading: string; items: string[] }[]
}

export const RELEASES: ReleaseNote[] = [
  {
    version: 'v1.8.0',
    title: 'Premium UI Redesign',
    date: '15 March 2026',
    sections: [
      {
        heading: 'Visual Overhaul',
        items: [
          'Premium felt-table aesthetic with themed CSS variables across all 3 themes',
          'Redesigned card faces: separate rank and suit display with corner indicators',
          'Subtler animations: reduced glow (3s cycle), gentler shimmer (7s cycle), softer card flight shadows',
          'Table felt surface uses radial gradient with theme-aware colors',
        ],
      },
      {
        heading: 'Layout Stability',
        items: [
          'Seat positions inset for 5-7 players to prevent panel edge clipping',
          'Tighter card gaps and reduced padding on remote player panels',
          'Minimum panel widths raised for 6+ players so 3 cards always fit',
          'Table zone height constraints refined to prevent action bar push-off',
          'Card container overflow set to visible so selection badges are never clipped',
        ],
      },
      {
        heading: 'Game Flow Clarity',
        items: [
          'Selection confirm banner now shows specific swap summary (e.g. "Confirm swap: Kamal\'s #1 ↔ Sara\'s #2")',
          'Peek reveal duration increased from 1.2s to 2s for better readability',
          'Turn indicator shows pulsing green dot when it\'s your turn',
          'Action phase text is now context-aware based on held card state',
          '"FINAL ROUND" banner appears when a player calls end — shows who called it',
          'Action highlight labels larger and more readable on table layout',
        ],
      },
      {
        heading: 'Theme Consistency',
        items: [
          'All modals themed: Drawn Card, Vote Kick, Settings, Patch Notes use CSS variables',
          'Home, Lobby, and Results pages use themed containers',
          'Game log newest entry highlight uses theme variable instead of hardcoded color',
          'Selection pulse uses dedicated CSS keyframe instead of generic animate-pulse',
        ],
      },
      {
        heading: 'Performance',
        items: [
          'GameLog wrapped in React.memo to prevent re-renders on unrelated state changes',
          'hasAnyLocks computation memoized to avoid recalculating every render',
          'All animations GPU-accelerated via transform/opacity — no layout thrashing',
        ],
      },
    ],
  },
  {
    version: 'v1.7.7',
    title: 'Card Overflow, Timer & Celebration',
    date: '15 March 2026',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed 7-player card overflow: reduced gaps, removed forced minWidth, cards now shrink-to-fit in narrow panels',
          'Fixed game log not auto-scrolling: tracks last entry content instead of log.length (bounded log replaces entries without changing length)',
          'Fixed timer randomly skipping/kicking players: immediately resets remaining time on turn change to prevent stale-zero expiry; added 3-second grace buffer for client clock-skew',
          'Fixed name input showing bank card autocomplete: added autoComplete="off" to all name inputs in Home and Lobby',
        ],
      },
      {
        heading: 'Results Celebration',
        items: [
          'Canvas confetti burst when all players reveal — two bursts from left/right with 160 particles',
          'New celebrate SFX: ascending 5-tone fanfare with harmonics',
          'Improved winner display: "Shared Win! X & Y are the champions!" for ties, "X wins!" for solo winner',
          'Tiebreaker: most sevens wins among tied players; if still tied, shared win',
        ],
      },
    ],
  },
  {
    version: 'v1.7.6',
    title: 'Lobby Color Instant Feedback',
    date: '14 March 2026',
    sections: [
      {
        heading: 'Lobby',
        items: [
          'Color picker now shows ring highlight and avatar color instantly on pick — no waiting for Firestore round-trip',
          'Optimistic pendingColorKey state: updates UI immediately, cleared when server confirms, reverted on conflict',
          'Auto-assign first available color on lobby entry with instant visual feedback',
        ],
      },
    ],
  },
  {
    version: 'v1.7.5',
    title: 'Log, Swap Highlight & Lock Blur',
    date: '13 March 2026',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed game log entries being invisible: removed framer-motion opacity conflict that overrode CSS style',
          'Fixed lobby color not auto-assigning on entry: added useEffect to pick first available color',
          'Fixed locked face-up cards being unreadable: known locked cards now show small corner lock badge instead of full blur overlay',
        ],
      },
      {
        heading: 'Swap Selection',
        items: [
          'Both swap targets now highlighted: first pick shows amber "1" badge, second pick shows emerald "2" badge',
          'Opponent cards pulse and highlight on hover during swap selection',
          'Non-selectable slots dimmed during selection mode for clarity',
        ],
      },
    ],
  },
  {
    version: 'v1.7.4',
    title: 'Vote Kick Rework & Per-Player Timer',
    date: '12 March 2026',
    sections: [
      {
        heading: 'Vote Kick',
        items: [
          'Vote kick now requires 3+ players (hidden for 2-player games)',
          'Timer pauses during active vote kick — resumes with remaining time when vote resolves',
          'actionVersion increments on vote start/resolve to prevent timer race conditions',
          'Kicked player sees a dedicated "You\'ve been kicked!" screen',
        ],
      },
      {
        heading: 'Timer',
        items: [
          'Timer now shown per-player under each panel instead of a single global bar',
          'Skip guard prevents auto-skip during active vote kick',
          'turnStartAt restored with vote duration when vote resolves',
        ],
      },
    ],
  },
  {
    version: 'v1.7.3',
    title: 'Vote Kick, Staging & Settings Fixes',
    date: '12 March 2026',
    sections: [
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed vote kick auto-kicking in 2-player games',
          'Fixed staging animation inconsistency with double rAF before getBoundingClientRect',
          'Fixed lobby settings not syncing between host and players',
          'Fixed player color not showing in classic layout',
          'Fixed timer not resetting on turn change in some edge cases',
          'Fixed AFK system firing during lobby phase',
        ],
      },
    ],
  },
  {
    version: 'v1.7.2',
    title: 'Rematch, AFK & Color Fixes',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Play Again',
        items: [
          'All players are now auto-redirected to the new lobby when anyone clicks Play Again',
          'No more having to independently click Play Again — the whole group stays together',
        ],
      },
      {
        heading: 'AFK System',
        items: [
          'Fixed a bug where the AFK timer could fire twice in one turn, causing premature kicks',
          'Skip-fired flag now resets only on actual turn change, not on every mid-turn action',
        ],
      },
      {
        heading: 'Lobby Color Picker',
        items: [
          'Taken colors now show a clear ✕ overlay instead of just dimming',
          'Makes unavailable colors immediately obvious at a glance',
        ],
      },
    ],
  },
  {
    version: 'v1.7.1',
    title: 'Turn Timer & Moderation',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Turn Timer',
        items: [
          'Configurable turn timer: Off, 30s, 60s, 90s, or 120s — set when creating a game',
          'Live countdown bar below the turn indicator (green → amber → red)',
          'Critical pulse animation on the timer when ≤5 seconds remain',
          'Timer resets when the turn advances to the next player',
        ],
      },
      {
        heading: 'AFK System',
        items: [
          'If the timer expires, the turn is auto-skipped and the player gets 1 AFK strike',
          'Drawn cards are auto-discarded when a turn is skipped',
          'On 2 consecutive AFK strikes, the player is kicked from the game',
          'AFK strikes reset whenever a player takes any action (draw from pile or discard)',
        ],
      },
      {
        heading: 'Vote-Kick',
        items: [
          'Any player can initiate a vote to kick another player via the Settings menu',
          'All players see a modal with vote progress — majority required to kick',
          'Voting "No" immediately cancels the vote to prevent griefing',
          'Kicked player is removed, turn advances if needed, host transfers if needed',
        ],
      },
      {
        heading: 'Technical',
        items: [
          'Auto-skip uses actionVersion guard so only one client triggers the skip',
          'All timer operations are client-side with Date.now() — no server timestamps needed',
          'Vote-kick data stored on game doc — real-time updates for all players',
          'Firestore rules updated to allow afkStrikes field on player docs',
        ],
      },
    ],
  },
  {
    version: 'v1.7.0',
    title: 'Identity & Lobby',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Unique Player Colors',
        items: [
          '16 high-contrast colors in the lobby picker — readable on dark felt UI',
          'Colors are "booked" — no two players can pick the same color',
          'Taken colors appear dimmed with tooltip showing who took them',
          'Color selection uses Firestore transactions to prevent race conditions',
        ],
      },
      {
        heading: 'Unique Player Names',
        items: [
          'No duplicate names allowed in a lobby (case-insensitive)',
          '"Azam" and "azam" are treated as the same name',
          'Validated at join time and when editing name in the lobby',
          'Clear error toast: "Name already taken in this lobby"',
        ],
      },
      {
        heading: 'Invite Link Flow',
        items: [
          'Invite links now show a name + color picker modal before joining',
          'See lobby player count, taken colors, and name conflicts in real-time',
          'Full/started lobbies show a clear message instead of auto-joining',
          'Cancel button returns to the Home page',
        ],
      },
      {
        heading: 'Security',
        items: [
          'Firestore rules restrict player doc updates to safe fields only',
          'Players can only modify: displayName, colorKey, connected, locks, lockedBy',
          'Prevents overwriting other players\' data through direct Firestore calls',
        ],
      },
    ],
  },
  {
    version: 'v1.6.0',
    title: 'Premium Polish',
    date: '11 March 2026',
    sections: [
      {
        heading: 'Premium Animations',
        items: [
          'Slower, floaty flying card arcs (1.4\u20131.7s) for a luxurious poker-table feel',
          'Enhanced arc height, mid-flight scale lift (1.08x), and organic rotation tilt',
          'Softer springs across StagingSlot, DiscardFlip, and CardView for buttery motion',
          'Deeper 3D perspective (800px) and longer reveal on discard flip (1.5s)',
          'Card hover lift enhanced: scale 1.07, y -5, subtle rotate',
        ],
      },
      {
        heading: 'Leave Game & Auto-End',
        items: [
          'End Game button removed \u2014 game ends automatically when the draw pile is empty',
          'FINAL badge when \u22643 cards remain; LAST TURN badge when pile hits 0',
          'Leave Game button in Settings \u2014 exit mid-game with confirmation',
          'Leave Lobby button \u2014 exit before the game starts',
          'Transaction-safe leave: host transfers, turn advances, drawn cards cleared',
          'Game continues with remaining players (2+) when someone leaves',
        ],
      },
      {
        heading: 'Home Screen',
        items: [
          'Game Statistics section: Games Played and Total Visits — universal across all devices via Firestore',
          'Strategy Tips placeholder section with 4 tips (Coming Soon)',
          'More floating background card suits with higher visibility',
        ],
      },
      {
        heading: 'Game Feel',
        items: [
          'Golden glow pulse on staging slot when a card is in play',
          'Button hover glow effect across the UI',
          'Responsive table-zone breakpoints for large screens (1024/1280/1440px)',
          'Settings icon no longer rotates on hover \u2014 cleaner look',
          'Improved tooltip positioning for right-aligned buttons',
          'More card padding for opponent panels in classic layout',
        ],
      },
      {
        heading: 'Bug Fixes',
        items: [
          'Fixed remote discard-take animation timing in classic layout',
          'Fixed unused import build errors (SPRING_TAP, setDoc, getSeatColor)',
          'Fixed leaveGame redundant ternary and missing Firestore read-before-write',
          'Selection mode and choreography properly reset on leave',
        ],
      },
    ],
  },
  {
    version: 'v1.5.0',
    title: 'Production Readiness',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Top Bar Redesign',
        items: [
          'Professional 3-zone layout: game info (left), turn strip (center), controls (right)',
          'Copyable room code in the top bar — click to copy instantly',
          'Compact turn queue in the top bar on desktop, full version below on mobile',
          'Consistent icon button sizing with the new topbar-btn class',
          'No wrap, no overlap, no layout shift — fixed height header',
        ],
      },
      {
        heading: 'Table Layout Engine',
        items: [
          'Rewritten getSeatPositions with pile-zone avoidance and spacing validation',
          'Table zone uses 70-80% viewport height (no more fixed pixel heights)',
          'Safe layout stack: banners/announcements push content down instead of overlapping',
          'Table layout disabled on mobile (<768px) — forced to classic',
          'Validated seat spacing: dev warnings if seats are too close',
        ],
      },
      {
        heading: 'Premium Card Motion',
        items: [
          'Slow, floaty flying cards — 1.4-1.7s arcs with gentle easing and 1.03x scale peak',
          'GPU-optimized transforms (translate x/y offsets, willChange: transform)',
          'Subtle rotation tilt during flight for organic feel',
          'Enhanced staging slot: gentler float (2.8s cycle), drop shadow, smoother entry',
          'Discard flip: longer 600ms reveal with scale overshoot (1.06x)',
          'Reduced motion fallback: clean 250ms fade + slide',
        ],
      },
      {
        heading: 'Swap Visibility',
        items: [
          'Queen swap highlights both involved slots with actor-color pulse rings',
          'Swap labels show swap partner near each slot (e.g. "↔ Kamal #2")',
          'Labels and highlights auto-clear after 2 seconds',
          'No card identity leaks — labels show position only, not card values',
        ],
      },
      {
        heading: 'Card-Back Polish',
        items: [
          'Richer 4-stop owner-color gradient for more depth and dimension',
          'Subtle inner highlight border for glass-like premium feel',
          'Refined center emblem with softer translucent background',
          'Gentler shimmer sweep (5s diagonal cycle, 6% opacity)',
          'Colored outer glow shadow matching owner seat color',
        ],
      },
      {
        heading: 'Shareability',
        items: [
          'Copy Link button in the lobby — share a direct room URL',
          'Invite Friends button — copies a formatted message with code + link',
          'Room code is still copyable by clicking in both lobby and game',
          'Clipboard utility with fallback for older browsers',
        ],
      },
      {
        heading: 'Game Log',
        items: [
          'Cleaner log layout with consistent row height and tighter spacing',
          'Latest entry highlighted with subtle background',
          'Older entries fade progressively for visual hierarchy',
          'Name chips with consistent min-width for short names',
          'Additional power keyword mappings for edge cases',
        ],
      },
      {
        heading: 'Quota Protection',
        items: [
          'Game log bounded at 50 entries — older entries auto-pruned',
          'Chat queries limited to last 50 messages',
          'Presence writes throttled to once per 60 seconds',
          'Lazy chat subscription (mobile: on open, desktop: after first render)',
          'Game finish summary analytics (one write per game)',
          'README now includes Quota Notes with scaling estimates',
        ],
      },
      {
        heading: 'Branding',
        items: [
          'Consistent Lucky Seven\u2122 title across all screens',
          'Updated watermark: Built by Kamal Hazriq',
          'Patch notes accessible from Home, Lobby, and in-game',
        ],
      },
    ],
  },
  {
    version: 'v1.4.3',
    title: 'UI Stabilization',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Toolbar & Controls',
        items: [
          'All toolbar buttons now show descriptive tooltips on hover',
          'Active state styling for Layout, UI Mode, and Log Position toggles',
          'Proper aria-labels on all toggle buttons for accessibility',
        ],
      },
      {
        heading: 'Table Layout',
        items: [
          'Wider seat spacing for 5-7 player games — no more card overlap',
          'Better two-row seat strategy: sides + top arc',
          'Taller table container with proportional heights per player count',
          'Reduced panel widths for 6+ players to prevent collision',
        ],
      },
      {
        heading: 'Card Styling',
        items: [
          'Premium card backs: full owner-color gradient fill, no heavy outline',
          'Subtle neutral border (border-white/6%) replaces thick colored ring',
          'White border highlight only appears on hover (desktop)',
          'Softer shimmer animation (8% opacity, 4s cycle)',
        ],
      },
      {
        heading: 'Game Log',
        items: [
          'Cleaner log layout with consistent row structure and vertical spacing',
          'Older entries fade out (opacity dimming) for visual hierarchy',
          'Compact uniform chip sizing for names, powers, and card references',
          'Left sidebar log with tighter padding and proper sticky positioning',
        ],
      },
      {
        heading: 'Patch Notes',
        items: [
          'Sub-versions (v1.4.1, v1.4.2, v1.4.3) grouped under v1.4 tab',
          'Expandable accordion for sub-version details',
          'Cleaner version navigation with +N badge for sub-version count',
        ],
      },
    ],
  },
  {
    version: 'v1.4.2',
    title: 'Premium Choreography',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Animation Engine',
        items: [
          'Floaty, premium flying card motion — 1.4–1.8s gentle arcs with subtle rotation',
          'Gentle cubic-bezier easing (0.22, 1, 0.36, 1) for a slow, poker-table feel',
          '20-step bezier curves with scale lift and organic tilt during flight',
          'Enhanced drop shadows for depth during flight',
        ],
      },
      {
        heading: 'Staging Area',
        items: [
          'New "In play" staging slot between Draw and Discard piles',
          'Discard takes fly to staging area first, then to your hand on swap',
          'Staged card floats gently with a subtle hover animation',
          'Staging is purely visual — no Firestore writes, reconstructs on refresh',
        ],
      },
      {
        heading: 'Card Choreography',
        items: [
          'Multi-step animation sequences: discard → staging → slot → discard',
          'Draw pile draws fly face-down to your panel (no identity leaks)',
          'Swapped-out cards fly to discard pile with flip reveal',
          '3D discard flip animation when a new card becomes the discard top',
        ],
      },
      {
        heading: 'Visual Clarity',
        items: [
          'Selected slots now show player name + slot number label ("Kamal #2")',
          'Card references in log messages highlighted with suit colors',
          'Source keywords (DISCARD, PILE) displayed as colored labels in logs',
          'Enhanced selection mode with clearer targeting indicators',
        ],
      },
    ],
  },
  {
    version: 'v1.4.1',
    title: 'Premium Polish',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Flying Cards',
        items: [
          'Smoother, more premium flying card animation with higher-res bezier arc (16 steps)',
          'Enhanced easing curve with subtle overshoot settle at the end',
          'Stronger drop shadow during flight for depth',
          'Reduced motion: clean fade + short slide (250ms) instead of arc',
        ],
      },
      {
        heading: 'Table Layout',
        items: [
          'Hand-tuned seat positions for 1–7 opponents with no overlaps',
          'Better spacing with safe-area clamping (header, sides, local player zone)',
          'Improved height scaling per player count',
        ],
      },
      {
        heading: 'Game Log',
        items: [
          'Fixed short player names (like "a") being incorrectly highlighted inside words',
          'Power names now display as bold uppercase badges (PEEK, SWAP, LOCK, UNLOCK, CHAOS)',
          'New log position toggle: Bottom (default) or Left sidebar on wide screens',
          'Log position persists in localStorage and forces bottom on mobile',
        ],
      },
    ],
  },
  {
    version: 'v1.4',
    title: 'Action Bar & Choreography',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Action Bar',
        items: [
          'Inline Action Bar replaces the drawn-card modal on desktop — swap, discard, and use powers without leaving the board',
          'Keyboard hints [1][2][3] and [Esc] shown on desktop for quick actions',
          'Selection mode: power flows (peek, swap, lock, unlock, rearrange) work inline with slot highlighting',
          'Toggle between Action Bar and Modal UI modes via the top bar',
        ],
      },
      {
        heading: 'Selection Mode',
        items: [
          'Selectable slots glow with an amber pulse ring; non-selectable slots are dimmed',
          'Selected targets get a checkmark badge for clear visual feedback',
          'Two-step selection for Queen Swap: pick first card, then second card',
          'Player-level selection for Chaos/Rearrange: click an opponent\'s panel directly',
          'Cancel anytime with Esc, or use the Back button to revert a pick',
        ],
      },
      {
        heading: 'Choreography',
        items: [
          'Lock/Unlock stamp overlay: a brief animated stamp appears on the affected player\'s panel',
          'Peek UX: temporary card reveal (1.2s flip-back) when using Peek in Action Bar mode',
          'All choreography animations respect reduced motion preferences',
        ],
      },
      {
        heading: 'Keyboard Shortcuts (Desktop)',
        items: [
          'Press [1], [2], or [3] to swap with that slot when you have a drawn card',
          'Press [Esc] to cancel a discard draw',
          'Press [Enter] to confirm a selection during power flows',
          'Shortcuts are disabled when chat input is focused',
        ],
      },
    ],
  },
  {
    version: 'v1.3',
    title: 'Table & Effects Update',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Table Layout',
        items: [
          'New poker-table layout: toggle between Classic and Table views during gameplay',
          'Players arranged in a circular formation around the table with your hand at the bottom',
          'Draw and discard piles centered on the table surface',
          'Flying card animations travel accurately to seat positions in both layouts',
        ],
      },
      {
        heading: 'Visual Effects',
        items: [
          'Card back shimmer now uses the card owner\'s seat color',
          'Active player panels glow softly with their assigned color during their turn',
          'Slot-level effect overlays: swapped, locked, and unlocked cards pulse briefly with the actor\'s color',
          'Discarded/swapped cards animate face-up to the discard pile for all viewers',
        ],
      },
      {
        heading: 'Gameplay',
        items: [
          'Pile draws can now be dismissed — minimize the modal and resume via the banner',
          'Discard draws show an explicit "Cancel Take" button to return the card',
          'Chat opens by default on desktop; preference saved in localStorage',
          'Chat rate limit enforced at 1 message per 2 seconds',
        ],
      },
      {
        heading: 'Quality of Life',
        items: [
          'Layout preference persists across sessions via localStorage',
          'Chat text limit aligned to 300 characters (matching security rules)',
          'All new animations respect reduced motion preferences',
        ],
      },
    ],
  },
  {
    version: 'v1.2',
    title: 'Polish & Presence Update',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Animations',
        items: [
          'Flying cards now travel along smooth curved arcs with drop shadows',
          'Enhanced action highlights: stronger glow with expanding pulse ring effect',
          'All motion effects respect reduced motion preferences',
        ],
      },
      {
        heading: 'Chat & Social',
        items: [
          'Chat bubbles: see other players\' latest messages floating above their panels',
          'Bubbles auto-fade after 4 seconds — no extra database usage',
          'Hardened chat security: messages validated server-side (userId + text length)',
        ],
      },
      {
        heading: 'Gameplay Clarity',
        items: [
          'Queue numbers (#1, #2, #3...) now shown beside each player\'s name',
          '"Pile draw — no undo" label on drawn card modal for pile draws',
          'Resume banner: tap to return to your drawn card after using a power',
        ],
      },
      {
        heading: 'Quality of Life',
        items: [
          'Feedback form now available on the Home screen (was lobby only)',
          '5-second cooldown between feedback submissions to prevent spam',
          'Strengthened Firestore security rules across all collections',
        ],
      },
    ],
  },
  {
    version: 'v1.1',
    title: 'Signal & Flow Update',
    date: '10 March 2026',
    sections: [
      {
        heading: 'Gameplay',
        items: [
          'Support for 5-8 players with deck multiplier (1x, 1.5x, 2x decks)',
          'Cards drawn from the pile can no longer be undone — commit to your draw!',
          'Power guide: tap the ? button to see what each power card does this game',
          'Cancel flow fix: pressing "Back" on a power modal returns to your drawn card without wasting it',
        ],
      },
      {
        heading: 'Visuals & Animations',
        items: [
          'Player colors: each seat gets a unique color shown on card backs, panels, and log names',
          'Flying card animations: watch cards move between piles and players in real time',
          'Action highlights: a temporary glow appears on player panels after they take an action',
          'Improved game log with colored player name chips for easy scanning',
        ],
      },
      {
        heading: 'Social',
        items: [
          'In-game chat with quick emoji buttons and player-colored message bubbles',
          'Chat available in both the lobby and during gameplay',
          'Unread message badge on the chat button',
          'Turn queue: see the full turn order and who\'s up next at a glance',
        ],
      },
      {
        heading: 'Quality of Life',
        items: [
          'Feedback form: send feedback directly from the lobby with star ratings',
          'Patch notes viewer: tap the version label to see what\'s new',
          'Performance improvements: bounded logs, throttled presence writes, lazy chat subscription',
          'Game-end analytics for win tracking',
        ],
      },
    ],
  },
  {
    version: 'v1.0',
    title: 'Lucky Seven \u2014 Launch',
    date: '9 March 2026',
    sections: [
      {
        heading: 'Core Game',
        items: [
          'Draw from the pile or discard, swap with your hand, or discard to end your turn',
          'Call "End Game" to trigger the final round \u2014 every other player gets one more turn',
          'Lowest total score wins, with bonus recognition for holding 7s',
        ],
      },
      {
        heading: 'Power Cards',
        items: [
          '6 customizable powers assigned to 10, J, Q, K, and Joker',
          'Peek: look at one of your face-down cards',
          'Peek All: reveal all three of your cards to yourself',
          'Swap: exchange any two players\' unlocked cards',
          'Lock: protect any card from being swapped',
          'Unlock: free a locked card',
          'Rearrange: randomly shuffle another player\'s unlocked cards',
        ],
      },
      {
        heading: 'Multiplayer',
        items: [
          'Real-time multiplayer powered by Firebase',
          'Lobby system with 6-character join codes \u2014 share and play instantly',
          '2-8 players per game',
        ],
      },
      {
        heading: 'Interface',
        items: [
          'Mobile-first responsive design with touch-friendly tap targets',
          'Three themes: Blue, Dark, and Light',
          'Sound effects and haptic vibration feedback',
          'Reduced motion support (follows system preference, or toggle manually)',
          'Results screen with podium display and multi-winner tie handling',
        ],
      },
      {
        heading: 'Credits',
        items: [
          'Created by Kamal Hazriq',
          'Idea by Imaduddin',
          'Deployed on GitHub Pages with automated CI/CD',
          'Anonymous authentication \u2014 no sign-up required',
        ],
      },
    ],
  },
]
