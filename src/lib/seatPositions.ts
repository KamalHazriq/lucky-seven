/**
 * getSeatPositions — returns { left, top } (%) for each seat around a poker-table ellipse.
 *
 * v1.4.3: Wider spacing for 5+ players, collision protection,
 * better two-row strategy for 6-7 opponents.
 *
 * Local player is always fixed at bottom-center (not returned here).
 *
 * @param otherCount  Number of OTHER players (excluding local player)
 * @returns Array of { left, top } percentage positions for otherPlayers[0..N-1]
 */
export interface SeatPosition {
  left: number  // percentage (0–100)
  top: number   // percentage (0–100)
}

// Safe bounds — reserve header, sides, and local player zone
const MIN_TOP = 6
const MAX_TOP = 74
const MIN_LEFT = 5
const MAX_LEFT = 95

const CX = 50
const CY = 42

/** Clamp a seat position to safe bounds */
function clamp(pos: SeatPosition): SeatPosition {
  return {
    left: Math.max(MIN_LEFT, Math.min(MAX_LEFT, pos.left)),
    top: Math.max(MIN_TOP, Math.min(MAX_TOP, pos.top)),
  }
}

export function getSeatPositions(otherCount: number): SeatPosition[] {
  if (otherCount === 0) return []

  // ─── Hand-tuned layouts for common player counts ───

  if (otherCount === 1) {
    return [clamp({ left: CX, top: 8 })]
  }

  if (otherCount === 2) {
    return [
      clamp({ left: 20, top: 18 }),
      clamp({ left: 80, top: 18 }),
    ]
  }

  if (otherCount === 3) {
    return [
      clamp({ left: 12, top: 26 }),
      clamp({ left: CX, top: 8 }),
      clamp({ left: 88, top: 26 }),
    ]
  }

  if (otherCount === 4) {
    return [
      clamp({ left: 8, top: 36 }),
      clamp({ left: 26, top: 10 }),
      clamp({ left: 74, top: 10 }),
      clamp({ left: 92, top: 36 }),
    ]
  }

  // 5+ players: use two-row strategy for best spacing
  if (otherCount === 5) {
    // Row 1 (top): 3 players evenly spaced
    // Row 2 (sides): 2 players flanking
    return [
      clamp({ left: 5, top: 40 }),
      clamp({ left: 20, top: 10 }),
      clamp({ left: CX, top: 7 }),
      clamp({ left: 80, top: 10 }),
      clamp({ left: 95, top: 40 }),
    ]
  }

  if (otherCount === 6) {
    // Row 1 (top): 4 players
    // Row 2 (sides): 2 players
    return [
      clamp({ left: 5, top: 42 }),
      clamp({ left: 12, top: 18 }),
      clamp({ left: 36, top: 7 }),
      clamp({ left: 64, top: 7 }),
      clamp({ left: 88, top: 18 }),
      clamp({ left: 95, top: 42 }),
    ]
  }

  if (otherCount === 7) {
    // Row 1 (top): 5 players
    // Row 2 (sides): 2 players
    return [
      clamp({ left: 5, top: 46 }),
      clamp({ left: 8, top: 22 }),
      clamp({ left: 28, top: 7 }),
      clamp({ left: CX, top: 6 }),
      clamp({ left: 72, top: 7 }),
      clamp({ left: 92, top: 22 }),
      clamp({ left: 95, top: 46 }),
    ]
  }

  // ─── Fallback: parametric elliptical distribution ───
  const positions: SeatPosition[] = []
  const rx = 44
  const ry = 34
  const padAngle = Math.max(0.04, 0.12 - otherCount * 0.008)
  const startAngle = Math.PI - padAngle
  const endAngle = padAngle

  for (let i = 0; i < otherCount; i++) {
    const t = i / (otherCount - 1)
    const angle = startAngle - t * (startAngle - endAngle)
    const left = CX + rx * Math.cos(angle)
    const top = CY - ry * Math.sin(angle)
    positions.push(clamp({ left, top }))
  }

  return positions
}

/** Local player fixed position — bottom center */
export const LOCAL_SEAT: SeatPosition = { left: 50, top: 94 }
