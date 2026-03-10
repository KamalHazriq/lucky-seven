// Deterministic player color palette based on seatIndex (0–7).
// No Firestore storage needed — derived purely from PlayerDoc.seatIndex.

export interface SeatColor {
  name: string
  solid: string   // Full color for borders, chips, name dots
  tinted: string  // ~25% opacity for card back accents
  text: string    // Readable text for log name chips
  bg: string      // Semi-transparent background for chips
}

const SEAT_COLORS: SeatColor[] = [
  { name: 'blue',    solid: '#3b82f6', tinted: 'rgba(59,130,246,0.25)',  text: '#93c5fd', bg: 'rgba(59,130,246,0.15)' },
  { name: 'emerald', solid: '#10b981', tinted: 'rgba(16,185,129,0.25)',  text: '#6ee7b7', bg: 'rgba(16,185,129,0.15)' },
  { name: 'amber',   solid: '#f59e0b', tinted: 'rgba(245,158,11,0.25)', text: '#fcd34d', bg: 'rgba(245,158,11,0.15)' },
  { name: 'rose',    solid: '#f43f5e', tinted: 'rgba(244,63,94,0.25)',   text: '#fda4af', bg: 'rgba(244,63,94,0.15)' },
  { name: 'violet',  solid: '#8b5cf6', tinted: 'rgba(139,92,246,0.25)', text: '#c4b5fd', bg: 'rgba(139,92,246,0.15)' },
  { name: 'cyan',    solid: '#06b6d4', tinted: 'rgba(6,182,212,0.25)',  text: '#67e8f9', bg: 'rgba(6,182,212,0.15)' },
  { name: 'orange',  solid: '#f97316', tinted: 'rgba(249,115,22,0.25)', text: '#fdba74', bg: 'rgba(249,115,22,0.15)' },
  { name: 'lime',    solid: '#84cc16', tinted: 'rgba(132,204,22,0.25)', text: '#bef264', bg: 'rgba(132,204,22,0.15)' },
]

export function getSeatColor(seatIndex: number): SeatColor {
  return SEAT_COLORS[seatIndex % SEAT_COLORS.length]
}

// ─── Lobby color picker palette (16 colors) ────────────────────
export const LOBBY_COLORS: string[] = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
  '#ef4444', // red
  '#eab308', // yellow
  '#6366f1', // indigo
  '#78716c', // stone
  '#e2e8f0', // slate-light
]
