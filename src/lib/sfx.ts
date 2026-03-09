// WebAudio oscillator-based sound effects — no external audio files needed
let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.08) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.value = volume
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + duration)
}

export const SFX = {
  draw: () => beep(660, 0.08, 'sine', 0.06),
  swap: () => { beep(440, 0.06, 'square', 0.04); setTimeout(() => beep(550, 0.06, 'square', 0.04), 60) },
  discard: () => beep(330, 0.1, 'triangle', 0.05),
  lock: () => { beep(220, 0.1, 'sawtooth', 0.04); setTimeout(() => beep(180, 0.15, 'sawtooth', 0.03), 80) },
  unlock: () => { beep(440, 0.06, 'sine', 0.05); setTimeout(() => beep(660, 0.08, 'sine', 0.05), 70) },
  endGame: () => { beep(523, 0.12, 'sine', 0.06); setTimeout(() => beep(659, 0.12, 'sine', 0.06), 120); setTimeout(() => beep(784, 0.2, 'sine', 0.06), 240) },
  error: () => { beep(200, 0.1, 'square', 0.05); setTimeout(() => beep(160, 0.15, 'square', 0.04), 100) },
}

// Storage key
const SFX_KEY = 'lucky7_sfx_enabled'
const HAPTIC_KEY = 'lucky7_haptic_enabled'

export function isSfxEnabled(): boolean {
  return localStorage.getItem(SFX_KEY) === 'true'
}

export function setSfxEnabled(v: boolean) {
  localStorage.setItem(SFX_KEY, v ? 'true' : 'false')
}

export function isHapticEnabled(): boolean {
  return localStorage.getItem(HAPTIC_KEY) === 'true'
}

export function setHapticEnabled(v: boolean) {
  localStorage.setItem(HAPTIC_KEY, v ? 'true' : 'false')
}

export function playSfx(name: keyof typeof SFX) {
  if (!isSfxEnabled()) return
  SFX[name]()
}

export function vibrate(ms = 30) {
  if (!isHapticEnabled()) return
  navigator.vibrate?.(ms)
}
