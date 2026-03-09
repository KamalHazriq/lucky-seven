/**
 * getSeatPositions — returns { left, top } (%) for each seat around a poker-table ellipse.
 *
 * Local player is always fixed at bottom-center.
 * Other players are distributed across the top arc (left → top → right).
 *
 * @param otherCount  Number of OTHER players (excluding local player)
 * @returns Array of { left, top } percentage positions for otherPlayers[0..N-1]
 */
export interface SeatPosition {
  left: number  // percentage (0–100)
  top: number   // percentage (0–100)
}

export function getSeatPositions(otherCount: number): SeatPosition[] {
  if (otherCount === 0) return []

  // Ellipse radii in % of container
  const rx = 44
  const ry = 40

  // For a single opponent, place at top center
  if (otherCount === 1) {
    return [{ left: 50, top: 50 - ry }] // top center
  }

  // For 2+ opponents, distribute across the top arc
  // Arc goes from ~160° (left) through 90° (top) to ~20° (right)
  // Using angles in radians: PI=180°, PI/2=90°, 0°=right
  const positions: SeatPosition[] = []

  // Widen the arc for fewer players, tighten for many
  const padAngle = otherCount <= 3 ? 0.2 : otherCount <= 5 ? 0.15 : 0.1
  const startAngle = Math.PI - padAngle  // slightly less than 180° (left side)
  const endAngle = padAngle              // slightly more than 0° (right side)

  for (let i = 0; i < otherCount; i++) {
    const t = otherCount === 1 ? 0.5 : i / (otherCount - 1)
    const angle = startAngle - t * (startAngle - endAngle)

    const left = 50 + rx * Math.cos(angle)
    const top = 50 - ry * Math.sin(angle)
    positions.push({ left, top })
  }

  return positions
}

/** Local player fixed position — bottom center */
export const LOCAL_SEAT: SeatPosition = { left: 50, top: 95 }
