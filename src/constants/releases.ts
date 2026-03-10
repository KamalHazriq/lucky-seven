export const CURRENT_VERSION = 'v1.4.3'

export interface ReleaseNote {
  version: string
  title: string
  date: string
  sections: { heading: string; items: string[] }[]
}

export const RELEASES: ReleaseNote[] = [
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
