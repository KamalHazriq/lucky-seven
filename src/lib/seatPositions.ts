/**
 * getSeatPositions — v1.5 Table Layout Engine
 *
 * Returns { left, top } (%) for each opponent seat around a poker-table ellipse.
 * Local player is always fixed at bottom-center (not returned here).
 *
 * Layout rules:
 * - 1–4 players: circular/semi-circular arrangement
 * - 5–7 players: two-row strategy (sides + top arc)
 * - 8+ players: parametric elliptical fallback
 * - All positions clamped to safe bounds (header, sides, local player zone)
 * - Center pile zone (35–65% left, 35–55% top) is avoided for seats
 * - Table layout disabled on mobile (<768px) — enforced by useLayout hook
 *
 * @param otherCount  Number of OTHER players (excluding local player)
 * @param _layoutMode  Reserved for future layout variants
 * @param _containerRect  Reserved for dynamic container-aware positioning
 */
export interface SeatPosition {
  left: number  // percentage (0–100)
  top: number   // percentage (0–100)
}

// ─── Safe bounds — reserve header, sides, and local player zone ───
const MIN_TOP = 6    // Reserve top for header safe-area (bumped from 4)
const MAX_TOP = 76   // Reserve bottom for local player
const MIN_LEFT = 4   // Left edge padding
const MAX_LEFT = 96  // Right edge padding

// Center of the ellipse (slightly above center for visual balance)
const CX = 50
const CY = 40

// Center pile exclusion zone (seats should not land here)
const PILE_ZONE = { left: 34, right: 66, top: 32, bottom: 56 }

/** Minimum spacing between any two seats (in % units) */
const MIN_SEAT_DISTANCE = 14

/** Clamp a seat position to safe bounds */
function clamp(pos: SeatPosition): SeatPosition {
  return {
    left: Math.max(MIN_LEFT, Math.min(MAX_LEFT, pos.left)),
    top: Math.max(MIN_TOP, Math.min(MAX_TOP, pos.top)),
  }
}

/** Check if a position is inside the center pile zone */
function inPileZone(pos: SeatPosition): boolean {
  return (
    pos.left > PILE_ZONE.left && pos.left < PILE_ZONE.right &&
    pos.top > PILE_ZONE.top && pos.top < PILE_ZONE.bottom
  )
}

/** Push a position out of the pile zone by moving it radially outward */
function avoidPileZone(pos: SeatPosition): SeatPosition {
  if (!inPileZone(pos)) return pos
  const dx = pos.left - CX
  const dy = pos.top - CY
  const angle = Math.atan2(dy, dx)
  // Push outward from center
  const pushDist = 18
  return {
    left: CX + pushDist * Math.cos(angle) + (dx > 0 ? 4 : -4),
    top: CY + pushDist * Math.sin(angle),
  }
}

/** Validate minimum spacing between all seats, log warnings in dev */
function validateSpacing(positions: SeatPosition[]): SeatPosition[] {
  // Simple check — in production we just return as-is
  // The hand-tuned layouts should already satisfy spacing
  if (import.meta.env.DEV) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].left - positions[j].left
        const dy = positions[i].top - positions[j].top
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MIN_SEAT_DISTANCE) {
          console.warn(`[seatPositions] Seats ${i} and ${j} are too close (${dist.toFixed(1)}% < ${MIN_SEAT_DISTANCE}%)`)
        }
      }
    }
  }
  return positions
}

export function getSeatPositions(
  otherCount: number,
  _layoutMode?: 'table' | 'classic',
  _containerRect?: { width: number; height: number },
): SeatPosition[] {
  if (otherCount === 0) return []

  // ─── Hand-tuned layouts for common player counts ───

  if (otherCount === 1) {
    // Single opponent: top center
    return validateSpacing([
      clamp({ left: CX, top: 8 }),
    ])
  }

  if (otherCount === 2) {
    // Two opponents: top-left and top-right
    return validateSpacing([
      clamp({ left: 22, top: 16 }),
      clamp({ left: 78, top: 16 }),
    ])
  }

  if (otherCount === 3) {
    // Three: arc across the top
    return validateSpacing([
      clamp({ left: 12, top: 24 }),
      clamp({ left: CX, top: 8 }),
      clamp({ left: 88, top: 24 }),
    ])
  }

  if (otherCount === 4) {
    // Four: wider arc, sides lower
    return validateSpacing([
      clamp({ left: 6, top: 34 }),
      clamp({ left: 24, top: 10 }),
      clamp({ left: 76, top: 10 }),
      clamp({ left: 94, top: 34 }),
    ])
  }

  // ─── 5+ players: two-row strategy ───

  if (otherCount === 5) {
    // Row 1 (top arc): 3 players evenly spaced
    // Row 2 (sides): 2 players flanking lower
    return validateSpacing([
      clamp({ left: 4, top: 42 }),
      clamp({ left: 18, top: 12 }),
      clamp({ left: CX, top: 7 }),
      clamp({ left: 82, top: 12 }),
      clamp({ left: 96, top: 42 }),
    ])
  }

  if (otherCount === 6) {
    // Row 1 (top arc): 4 players
    // Row 2 (sides): 2 players
    return validateSpacing([
      clamp({ left: 4, top: 44 }),
      clamp({ left: 12, top: 18 }),
      clamp({ left: 35, top: 7 }),
      clamp({ left: 65, top: 7 }),
      clamp({ left: 88, top: 18 }),
      clamp({ left: 96, top: 44 }),
    ])
  }

  if (otherCount === 7) {
    // Row 1 (top arc): 5 players
    // Row 2 (sides): 2 players lower
    return validateSpacing([
      clamp({ left: 4, top: 48 }),
      clamp({ left: 8, top: 22 }),
      clamp({ left: 28, top: 7 }),
      clamp({ left: CX, top: 6 }),
      clamp({ left: 72, top: 7 }),
      clamp({ left: 92, top: 22 }),
      clamp({ left: 96, top: 48 }),
    ])
  }

  // ─── Fallback: parametric elliptical distribution for 8+ ───
  const positions: SeatPosition[] = []
  const rx = 45
  const ry = 35
  const padAngle = Math.max(0.04, 0.12 - otherCount * 0.008)
  const startAngle = Math.PI - padAngle
  const endAngle = padAngle

  for (let i = 0; i < otherCount; i++) {
    const t = otherCount === 1 ? 0.5 : i / (otherCount - 1)
    const angle = startAngle - t * (startAngle - endAngle)
    let pos: SeatPosition = {
      left: CX + rx * Math.cos(angle),
      top: CY - ry * Math.sin(angle),
    }
    pos = avoidPileZone(pos)
    positions.push(clamp(pos))
  }

  return validateSpacing(positions)
}

/** Local player fixed position — bottom center */
export const LOCAL_SEAT: SeatPosition = { left: 50, top: 94 }

/**
 * Check if table layout should be disabled.
 * Table layout is disabled on mobile (<768px viewport width).
 * This check is also enforced by useLayout hook, but this utility
 * can be used for tooltip/messaging purposes.
 */
export function isTableLayoutDisabled(): boolean {
  if (typeof window === 'undefined') return true
  return window.innerWidth < 768
}
