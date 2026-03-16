import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RELEASES, CURRENT_VERSION } from '../constants/releases'
import type { ReleaseNote } from '../constants/releases'

interface PatchNotesModalProps {
  open: boolean
  onClose: () => void
  onOpenFeedback?: () => void
}

/**
 * Group releases by major.minor version.
 * e.g. v1.4, v1.4.1, v1.4.2 all belong to group "v1.4"
 */
function getVersionGroup(version: string): string {
  // "v1.4.2" → "v1.4", "v1.4" → "v1.4", "v1.3" → "v1.3"
  const match = version.match(/^(v\d+\.\d+)/)
  return match ? match[1] : version
}

interface VersionGroup {
  key: string        // e.g. "v1.4"
  primary: ReleaseNote  // The base version (v1.4)
  subs: ReleaseNote[]   // Sub-versions (v1.4.1, v1.4.2) — newest first
}

export default function PatchNotesModal({ open, onClose, onOpenFeedback }: PatchNotesModalProps) {
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0)
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({})

  // Group releases by major.minor
  const groups = useMemo<VersionGroup[]>(() => {
    const groupMap = new Map<string, ReleaseNote[]>()
    for (const r of RELEASES) {
      const key = getVersionGroup(r.version)
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(r)
    }

    const result: VersionGroup[] = []
    for (const [key, releases] of groupMap) {
      // Primary = the base version (exact key match like "v1.4"), or fallback to last in group
      const primary = releases.find((r) => r.version === key) ?? releases[releases.length - 1]
      // Subs = anything that's not the primary (compare by reference to avoid key mismatch)
      const subs = releases.filter((r) => r !== primary)
      result.push({ key, primary, subs })
    }

    return result
  }, [])

  const toggleSub = (version: string) => {
    setExpandedSubs((prev) => ({ ...prev, [version]: !prev[version] }))
  }

  const currentGroup = groups[selectedGroupIdx]

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
            className="border rounded-2xl p-5 max-w-md w-full shadow-2xl max-h-[80vh] flex flex-col"
            style={{ background: 'var(--surface-solid)', borderColor: 'var(--border-solid)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="text-lg font-bold text-amber-300">Patch Notes</h3>
                <p className="text-[10px] text-slate-500">Lucky Seven {CURRENT_VERSION}</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-sm"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            {/* Version group tabs */}
            <div className="flex gap-1.5 mb-3 shrink-0 flex-wrap">
              {groups.map((g, i) => (
                <button
                  key={g.key}
                  onClick={() => setSelectedGroupIdx(i)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    selectedGroupIdx === i
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {g.key}
                  {g.subs.length > 0 && (
                    <span className="ml-1 text-[9px] opacity-60">+{g.subs.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {currentGroup && (
                <div className="flex flex-col gap-1.5">
                  {/* All versions as accordions — subs first, then primary */}
                  {[...currentGroup.subs, currentGroup.primary].map((release) => {
                    const isExpanded = !!expandedSubs[release.version]
                    return (
                      <div key={release.version} className="rounded-lg border border-slate-700/50 overflow-hidden">
                        <button
                          onClick={() => toggleSub(release.version)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-amber-300">{release.version}</span>
                            <span className="text-[10px] text-slate-400">{release.title}</span>
                          </div>
                          <motion.span
                            animate={{ rotate: isExpanded ? 180 : 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                            className="text-slate-500 text-xs"
                          >
                            {'\u25BC'}
                          </motion.span>
                        </button>
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ type: 'spring', stiffness: 350, damping: 30, mass: 0.5 }}
                              className="overflow-hidden"
                            >
                              <div className="px-3 py-2 border-t border-slate-700/30">
                                <p className="text-[10px] text-slate-500 mb-2">{release.date}</p>
                                {renderSections(release.sections)}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer — credits + trademark + feedback */}
            <div className="mt-4 pt-3 border-t border-slate-700/50 shrink-0">
              <p className="text-[10px] text-slate-500 text-center">
                Created by Kamal Hazriq &middot; Idea by Imaduddin
              </p>
              <p className="text-[9px] text-slate-600 text-center mt-1">
                Lucky Seven&trade; is a fan-made game implementation.
              </p>
              {onOpenFeedback && (
                <button
                  onClick={onOpenFeedback}
                  className="mt-3 w-full py-2 bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  Send Feedback
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Render release sections (shared between primary and sub-versions) */
function renderSections(sections: { heading: string; items: string[] }[]) {
  return sections.map((section, si) => (
    <div key={si} className="mb-3">
      <h5 className="text-xs font-semibold text-amber-400/80 uppercase tracking-wider mb-1.5">
        {section.heading}
      </h5>
      <ul className="space-y-1.5 mb-2">
        {section.items.map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-slate-300">
            <span className="text-amber-400 shrink-0">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  ))
}
