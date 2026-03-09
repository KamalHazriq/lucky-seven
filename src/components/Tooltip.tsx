import { useState, useRef, useCallback, useEffect } from 'react'

interface TooltipProps {
  text: string
  children: React.ReactNode
  position?: 'top' | 'bottom'
}

export default function Tooltip({ text, children, position = 'top' }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const show = () => setVisible(true)
  const hide = () => setVisible(false)

  const handleTouchStart = useCallback(() => {
    longPressRef.current = setTimeout(() => {
      setVisible(true)
    }, 400)
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressRef.current) clearTimeout(longPressRef.current)
  }, [])

  // Close on outside tap (mobile)
  useEffect(() => {
    if (!visible) return
    const handler = (e: TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }
    document.addEventListener('touchstart', handler, { passive: true })
    return () => document.removeEventListener('touchstart', handler)
  }, [visible])

  const positionClass = position === 'top'
    ? 'bottom-full left-1/2 -translate-x-1/2 mb-1.5'
    : 'top-full left-1/2 -translate-x-1/2 mt-1.5'

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="group"
      aria-describedby={visible ? 'tooltip' : undefined}
    >
      {children}
      {visible && (
        <div
          id="tooltip"
          role="tooltip"
          className={`absolute ${positionClass} z-50 bg-slate-900 border border-slate-600 text-slate-200 text-[10px] font-medium px-2.5 py-1.5 rounded-lg shadow-lg whitespace-nowrap pointer-events-none max-w-[200px]`}
        >
          {text}
        </div>
      )}
    </div>
  )
}
