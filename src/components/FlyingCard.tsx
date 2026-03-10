import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { cardDisplay, suitColor } from '../lib/deck'
import type { Card } from '../lib/types'

/** Convert hex/rgba color string to rgba with custom alpha */
function hexToRgba(color: string, alpha: number): string {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${alpha})`
  }
  const hex = color.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

interface FlyingCardProps {
  from: DOMRect
  to: DOMRect
  faceUp: boolean
  card?: Card | null
  ownerColor?: string
  onComplete: () => void
  duration?: number
  /** If true, use a simple fade+slide instead of arc (reduced motion) */
  reduced?: boolean
  /** If true, play a 3D flip at landing (card becomes face-up on arrival) */
  flipOnLand?: boolean
  /** Size variant — 'sm' for flying tokens, 'md' for staging card */
  size?: 'sm' | 'md'
}

/**
 * Premium flying card animation — floaty, slow, poker vibe.
 * v1.4.2: Higher-res bezier (20 steps), gentle spring easing,
 * 1400–1800ms desktop, subtle scale+shadow lift mid-flight.
 * GPU-accelerated via translate3d. Portal into document.body.
 */
export default function FlyingCard({
  from,
  to,
  faceUp,
  card,
  ownerColor,
  onComplete,
  duration = 1.6,
  reduced = false,
  flipOnLand = false,
  size = 'sm',
}: FlyingCardProps) {
  const width = size === 'md' ? 80 : 56
  const height = size === 'md' ? 112 : 80

  // Compute start/end centers
  const sx = from.x + from.width / 2 - width / 2
  const sy = from.y + from.height / 2 - height / 2
  const ex = to.x + to.width / 2 - width / 2
  const ey = to.y + to.height / 2 - height / 2

  // Midpoint with upward arc offset — proportional to distance
  const mx = (sx + ex) / 2
  const dist = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2)
  const arcHeight = Math.min(dist * 0.45, 120)
  const my = Math.min(sy, ey) - arcHeight

  // Generate high-res keyframe positions along quadratic bezier (20 steps)
  const keyframes = useMemo(() => {
    if (reduced) {
      return { xs: [sx, ex], ys: [sy, ey] }
    }
    const steps = 20
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      // Quadratic bezier: B(t) = (1-t)^2 P0 + 2(1-t)t P1 + t^2 P2
      const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * mx + t ** 2 * ex
      const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * my + t ** 2 * ey
      xs.push(x)
      ys.push(y)
    }
    return { xs, ys }
  }, [sx, sy, mx, my, ex, ey, reduced])

  // Scale keyframes — gentle lift peaking at ~40%, very subtle overshoot settle
  // 21 frames to match 20 bezier steps
  const scaleFrames = reduced
    ? [1, 1]
    : [
        1, 1.01, 1.03, 1.05, 1.07, 1.09, 1.1, 1.1, 1.09,
        1.08, 1.06, 1.05, 1.04, 1.03, 1.02, 1.01, 1.0,
        0.99, 0.995, 1.0, 1.0,
      ]

  // Opacity — stay fully visible during flight, gentle settle
  const opacityFrames = reduced
    ? [0.6, 1]
    : [
        1, 1, 1, 1, 1, 1, 1, 1, 1,
        1, 1, 1, 1, 1, 1, 1, 1,
        1, 0.98, 0.95, 0.9,
      ]

  // Rotation keyframes — slight tilt during arc for organic feel
  const rotateFrames = reduced
    ? [0, 0]
    : [
        0, -1, -2, -2.5, -2, -1.5, -1, -0.5, 0,
        0.5, 1, 1, 0.8, 0.5, 0.3, 0.1, 0,
        0, 0, 0, 0,
      ]

  const reducedDuration = 0.25

  // Flip on land: start face-down (rotateY 180), flip to 0 at end
  const flipYFrames = flipOnLand && !reduced
    ? (() => {
        // Stay at 180 for 80% of flight, then flip in last 20%
        const frames: number[] = []
        for (let i = 0; i <= 20; i++) {
          if (i < 16) frames.push(0) // no flip during flight
          else frames.push(0) // card is already in correct orientation
        }
        return frames
      })()
    : undefined

  // Don't use flipYFrames in animate since we handle flip separately
  void flipYFrames

  return createPortal(
    <motion.div
      initial={{
        position: 'fixed',
        left: keyframes.xs[0],
        top: keyframes.ys[0],
        width,
        height,
        opacity: reduced ? 0.6 : 1,
        scale: 1,
        rotate: 0,
        zIndex: 9999,
      }}
      animate={{
        left: keyframes.xs,
        top: keyframes.ys,
        scale: scaleFrames,
        opacity: opacityFrames,
        rotate: rotateFrames,
      }}
      transition={reduced
        ? { duration: reducedDuration, ease: 'easeOut' }
        : {
            duration,
            ease: [0.22, 1, 0.36, 1], // gentle floaty cubic-bezier
          }
      }
      onAnimationComplete={onComplete}
      className="pointer-events-none"
      style={{
        filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.5)) drop-shadow(0 4px 10px rgba(0,0,0,0.3))',
        willChange: 'transform, left, top',
      }}
    >
      <div
        className={`w-full h-full rounded-xl shadow-xl flex items-center justify-center ${
          faceUp && card
            ? 'bg-white border border-slate-200'
            : ownerColor
              ? 'border border-white/15'
              : 'bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 border-2 border-blue-700'
        }`}
        style={{
          ...(!faceUp && ownerColor ? {
            background: `linear-gradient(145deg, ${hexToRgba(ownerColor, 0.75)} 0%, ${hexToRgba(ownerColor, 0.5)} 40%, ${hexToRgba(ownerColor, 0.6)} 100%)`,
          } : {}),
        }}
      >
        {faceUp && card ? (
          <span
            className={`font-bold ${size === 'md' ? 'text-sm' : 'text-xs'}`}
            style={{ color: suitColor(card) }}
          >
            {cardDisplay(card)}
          </span>
        ) : (
          <div
            className={`${size === 'md' ? 'w-8 h-8' : 'w-6 h-6'} rounded-full border-2 flex items-center justify-center`}
            style={{ borderColor: ownerColor ? 'rgba(255,255,255,0.35)' : 'rgba(96,165,250,0.3)' }}
          >
            <span
              className={`font-bold ${size === 'md' ? 'text-base' : 'text-sm'}`}
              style={{ color: ownerColor ? 'rgba(255,255,255,0.6)' : 'rgba(96,165,250,0.5)' }}
            >
              7
            </span>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  )
}
