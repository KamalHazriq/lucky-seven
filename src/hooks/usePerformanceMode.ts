import { useState, useEffect } from 'react'
import { isPerformanceModeEnabled } from '../lib/sfx'

/**
 * Returns true when Performance Mode is enabled.
 * Reacts to same-tab toggles (custom event) and cross-tab changes (storage event).
 */
export function usePerformanceMode(): boolean {
  const [enabled, setEnabled] = useState(isPerformanceModeEnabled)

  useEffect(() => {
    const sync = () => setEnabled(isPerformanceModeEnabled())
    window.addEventListener('lucky7_perf_change', sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener('lucky7_perf_change', sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  return enabled
}
