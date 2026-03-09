/**
 * getSeatPositions — returns { left, top } (%) for each seat around a poker-table ellipse.
 *
 * Local player is always fixed at bottom-center (not returned here).
 * Other players are distributed across the top arc (left → top → right).
 *
 * The ellipse center is at (50%, 46%) to give more room at top for headers.
 * Top seats get a minimum top% of ~8% to avoid overlapping sticky UI.
 *
 * @param otherCount  Number of OTHER players (excluding local player)
 * @returns Array of { left, top } percentage positions for otherPlayers[0..N-1]
 */
export interface SeatPosition {
  left: number  // percentage (0–100)
  top: number   // percentage (0–100)
}

// Ellipse center — biased down slightly so top seats have clearance
const CX = 50
const CY = 48

export function getSeatPositions(otherCount: number): SeatPosition[] {
  if (otherCount === 0) return []

  // Ellipse radii in % of container
  const rx = 43
  const ry = 38

  // For a single opponent, place at top center
  if (otherCount === 1) {
    return [{ left: CX, top: CY - ry }]
  }

  // For 2+ opponents, distribute across the top arc
  // Arc goes from ~170° (left) through 90° (top) to ~10° (right)
  const positions: SeatPosition[] = []

  // Widen the arc for fewer players, tighten for many
  const padAngle = otherCount <= 3 ? 0.15 : otherCount <= 5 ? 0.12 : 0.08
  const startAngle = Math.PI - padAngle
  const endAngle = padAngle

  for (let i = 0; i < otherCount; i++) {
    const t = i / (otherCount - 1)
    const angle = startAngle - t * (startAngle - endAngle)

    const left = CX + rx * Math.cos(angle)
    const top = CY - ry * Math.sin(angle)

    // Clamp: never let seats go above 6% (reserve for headers)
    positions.push({ left, top: Math.max(top, 6) })
  }

  return positions
}

/** Local player fixed position — bottom center */
export const LOCAL_SEAT: SeatPosition = { left: 50, top: 94 }
