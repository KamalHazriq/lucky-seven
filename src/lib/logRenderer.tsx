import { type ReactNode } from 'react'
import { getSeatColor } from './playerColors'

interface PlayerInfo {
  displayName: string
  seatIndex: number
}

// ─── Power label map ────────────────────────────────────────
// Maps any variation of power text → display label (BOLD + CAPS)
const POWER_KEYWORDS: Record<string, string> = {
  'peek all': 'PEEK ALL',
  'peek_all_three_of_your_cards': 'PEEK ALL',
  'peek_all': 'PEEK ALL',
  'as peek all': 'PEEK ALL',
  'as peek_all': 'PEEK ALL',
  'peek 1': 'PEEK',
  'peek_one_of_your_cards': 'PEEK',
  'peek_one': 'PEEK',
  'as peek': 'PEEK',
  'as peek_one': 'PEEK',
  'as swap': 'SWAP',
  'swap_one_to_one': 'SWAP',
  'as lock': 'LOCK',
  'lock_one_card': 'LOCK',
  'as unlock': 'UNLOCK',
  'unlock_one_locked_card': 'UNLOCK',
  'as rearrange': 'CHAOS',
  'rearrange_cards': 'CHAOS',
}

// Build a regex for power keywords — match longest first
const powerKeywordsSorted = Object.keys(POWER_KEYWORDS).sort((a, b) => b.length - a.length)
const powerPattern = new RegExp(
  `(${powerKeywordsSorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi',
)

// ─── Card display pattern — matches suit symbols in parentheses ────
// Matches patterns like (10♠), (K♥), (A♦), (Joker), (7♣)
const CARD_PATTERN = /(\([^)]*[♠♥♦♣][^)]*\)|\(Joker\))/g

// ─── Source keywords — DISCARD, PILE ────────────────────────
const SOURCE_KEYWORDS: Record<string, { label: string; color: string }> = {
  'discard': { label: 'DISCARD', color: 'text-orange-400' },
  'the discard': { label: 'DISCARD', color: 'text-orange-400' },
  'from discard': { label: 'DISCARD', color: 'text-orange-400' },
  'the pile': { label: 'PILE', color: 'text-blue-400' },
  'from the pile': { label: 'PILE', color: 'text-blue-400' },
  'drew from pile': { label: 'PILE', color: 'text-blue-400' },
}

const sourceKeywordsSorted = Object.keys(SOURCE_KEYWORDS).sort((a, b) => b.length - a.length)
const sourcePattern = new RegExp(
  `(${sourceKeywordsSorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
  'gi',
)

/** Power label chip — small rounded pill, consistent color */
function PowerChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-px rounded-md text-[9px] font-bold uppercase tracking-wider bg-violet-900/50 text-violet-300 border border-violet-700/30 leading-none align-middle">
      {label}
    </span>
  )
}

/** Card display chip — shows card with suit color */
function CardChip({ text }: { text: string }) {
  const isRed = text.includes('\u2665') || text.includes('\u2666') // hearts or diamonds
  const isJoker = text.toLowerCase().includes('joker')
  const colorClass = isJoker ? 'text-purple-400' : isRed ? 'text-red-400' : 'text-slate-300'

  return (
    <span className={`inline-flex items-center px-1 py-px rounded text-[9px] font-bold bg-slate-800/50 border border-slate-600/30 leading-none align-middle ${colorClass}`}>
      {text}
    </span>
  )
}

/** Source label chip — DISCARD or PILE */
function SourceChip({ label, color }: { label: string; color: string }) {
  return (
    <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider leading-none align-middle ${color}`}>
      {label}
    </span>
  )
}

/**
 * Process a text fragment for card patterns, source keywords, and power keywords.
 * Returns an array of ReactNode fragments.
 */
function processTextFragment(text: string, keyPrefix: string): ReactNode[] {
  const result: ReactNode[] = []

  // First split on card patterns
  CARD_PATTERN.lastIndex = 0
  const cardParts = text.split(CARD_PATTERN)

  for (let c = 0; c < cardParts.length; c++) {
    const cardPart = cardParts[c]
    if (!cardPart) continue

    // Check if this is a card reference
    CARD_PATTERN.lastIndex = 0
    if (CARD_PATTERN.test(cardPart)) {
      CARD_PATTERN.lastIndex = 0
      result.push(<CardChip key={`${keyPrefix}-card-${c}`} text={cardPart} />)
      continue
    }

    // Check for source keywords
    sourcePattern.lastIndex = 0
    const sourceParts = cardPart.split(sourcePattern)

    if (sourceParts.length === 1) {
      // No source keywords — check for power keywords
      powerPattern.lastIndex = 0
      const powerParts = cardPart.split(powerPattern)

      if (powerParts.length === 1) {
        result.push(<span key={`${keyPrefix}-text-${c}`}>{cardPart}</span>)
      } else {
        for (let p = 0; p < powerParts.length; p++) {
          const pp = powerParts[p]
          if (!pp) continue
          const normalized = pp.toLowerCase()
          const powerLabel = POWER_KEYWORDS[normalized]
          if (powerLabel) {
            result.push(<PowerChip key={`${keyPrefix}-power-${c}-${p}`} label={powerLabel} />)
          } else {
            result.push(<span key={`${keyPrefix}-frag-${c}-${p}`}>{pp}</span>)
          }
        }
      }
    } else {
      for (let s = 0; s < sourceParts.length; s++) {
        const sp = sourceParts[s]
        if (!sp) continue
        const normalized = sp.toLowerCase()
        const sourceInfo = SOURCE_KEYWORDS[normalized]
        if (sourceInfo) {
          result.push(<SourceChip key={`${keyPrefix}-src-${c}-${s}`} label={sourceInfo.label} color={sourceInfo.color} />)
        } else {
          // Recurse for power keywords in remaining text
          powerPattern.lastIndex = 0
          const powerParts = sp.split(powerPattern)
          if (powerParts.length === 1) {
            result.push(<span key={`${keyPrefix}-stxt-${c}-${s}`}>{sp}</span>)
          } else {
            for (let p = 0; p < powerParts.length; p++) {
              const pp = powerParts[p]
              if (!pp) continue
              const normalizedP = pp.toLowerCase()
              const powerLabel = POWER_KEYWORDS[normalizedP]
              if (powerLabel) {
                result.push(<PowerChip key={`${keyPrefix}-spow-${c}-${s}-${p}`} label={powerLabel} />)
              } else {
                result.push(<span key={`${keyPrefix}-sfrag-${c}-${s}-${p}`}>{pp}</span>)
              }
            }
          }
        }
      }
    }
  }

  return result
}

/**
 * Renders a log message with:
 * 1. Player names highlighted as colored chips (word-boundary safe)
 * 2. Power keywords rendered as bold uppercase badges
 * 3. Card references (10♠) highlighted with suit colors
 * 4. Source keywords (DISCARD, PILE) highlighted
 *
 * v1.4.2: Card display chips, source labels, enhanced readability.
 */
export function renderLogMessage(
  msg: string,
  playerMap: PlayerInfo[],
): ReactNode {
  if (playerMap.length === 0 && !powerPattern.test(msg)) {
    // Still check for card/source patterns even without players
    powerPattern.lastIndex = 0
    const fragments = processTextFragment(msg, 'np')
    return fragments.length > 0 ? fragments : msg
  }
  // Reset regex lastIndex since we use 'g' flag
  powerPattern.lastIndex = 0

  // Sort by name length descending so longer names match first
  const sorted = [...playerMap].sort(
    (a, b) => b.displayName.length - a.displayName.length,
  )

  // Build a name → seatIndex lookup
  const nameToSeat: Record<string, number> = {}
  for (const p of sorted) {
    nameToSeat[p.displayName] = p.seatIndex
  }

  // ─── Step 1: Split on player names using word boundaries ───
  const escaped = sorted.map((p) =>
    p.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  )

  const namePatternStr = escaped
    .map((name) => `\\b${name}\\b`)
    .join('|')

  let parts: string[]
  if (sorted.length > 0 && namePatternStr) {
    const namePattern = new RegExp(`(${namePatternStr})`, 'g')
    parts = msg.split(namePattern)
  } else {
    parts = [msg]
  }

  // ─── Step 2: For each part, check if it's a name or process for keywords ───
  const result: ReactNode[] = []

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    if (!part) continue

    // Check if this part is a player name
    const seat = nameToSeat[part]
    if (seat !== undefined) {
      const color = getSeatColor(seat)
      result.push(
        <span
          key={`name-${i}`}
          className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold leading-none align-middle whitespace-nowrap"
          style={{
            backgroundColor: color.bg,
            color: color.text,
            minWidth: '2em',
            textAlign: 'center',
          }}
        >
          {part}
        </span>,
      )
      continue
    }

    // Not a name — process for card, source, and power keywords
    const fragments = processTextFragment(part, `frag-${i}`)
    result.push(...fragments)
  }

  return result.length > 0 ? result : msg
}
