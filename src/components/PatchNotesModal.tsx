import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RELEASES, BETA_RELEASES, CURRENT_VERSION } from '../constants/releases'
import type { ReleaseNote } from '../constants/releases'

interface PatchNotesModalProps {
  open: boolean
  onClose: () => void
  onOpenFeedback?: () => void
}

/**
 * Group releases by major.minor version.
 * e.g. v0.8, v0.8.1, v0.8.2 all belong to group "v0.8"
 */
function getVersionGroup(version: string): string {
  const match = version.match(/^(v\d+\.\d+)/)
  return match ? match[1] : version
}

interface VersionGroup {
  key: string
  primary: ReleaseNote
  subs: ReleaseNote[]
}

function buildGroups(releases: ReleaseNote[]): VersionGroup[] {
  const groupMap = new Map<string, ReleaseNote[]>()
  for (const r of releases) {
    const key = getVersionGroup(r.version)
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(r)
  }

  const result: VersionGroup[] = []
  for (const [key, groupReleases] of groupMap) {
    const primary = groupReleases.find((r) => r.version === key) ?? groupReleases[groupReleases.length - 1]
    const subs = groupReleases.filter((r) => r !== primary)
    result.push({ key, primary, subs })
  }
  return result
}

export default function PatchNotesModal({ open, onClose, onOpenFeedback }: PatchNotesModalProps) {
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0)
  const [expandedSubs, setExpandedSubs] = useState<Record<string, boolean>>({})
  const [showBeta, setShowBeta] = useState(false)

  const officialGroups = useMemo(() => buildGroups(RELEASES), [])
  const betaGroups = useMemo(() => buildGroups(BETA_RELEASES), [])

  const activeGroups = showBeta ? betaGroups : officialGroups

  const toggleSub = (version: string) => {
    setExpandedSubs((prev) => ({ ...prev, [version]: !prev[version] }))
  }

  const handleTabSwitch = (toBeta: boolean) => {
    setShowBeta(toBeta)
    setSelectedGroupIdx(0)
    setExpandedSubs({})
  }

  const currentGroup = activeGroups[selectedGroupIdx]

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
            <div className="flex items-center justify-between mb-3 shrink-0">
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

            {/* Section toggle: Current / Beta History */}
            <div className="flex gap-1 mb-3 p-0.5 bg-slate-800/60 rounded-lg shrink-0">
              <button
                onClick={() => handleTabSwitch(false)}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  !showBeta
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Current Release
              </button>
              <button
                onClick={() => handleTabSwitch(true)}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  showBeta
                    ? 'bg-slate-600 text-slate-200 shadow-sm'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                Beta History
              </button>
            </div>

            {/* Version group tabs */}
            <div className="flex gap-1.5 mb-3 shrink-0 flex-wrap">
              {activeGroups.map((g, i) => (
                <button
                  key={g.key}
                  onClick={() => setSelectedGroupIdx(i)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    selectedGroupIdx === i
                      ? showBeta ? 'bg-slate-600 text-white' : 'bg-amber-600 text-white'
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
              {showBeta && (
                <p className="text-[10px] text-slate-500 mb-2 px-1">
                  Pre-launch development history
                </p>
              )}
              {currentGroup && (
                <div className="flex flex-col gap-1.5">
                  {[...currentGroup.subs, currentGroup.primary].map((release) => {
                    const isExpanded = !!expandedSubs[release.version]
                    return (
                      <div key={release.version} className="rounded-lg border border-slate-700/50 overflow-hidden">
                        <button
                          onClick={() => toggleSub(release.version)}
                          className="w-full flex items-center justify-between px-3 py-2 bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-bold ${showBeta ? 'text-slate-400' : 'text-amber-300'}`}>
                              {release.version}
                            </span>
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

            {/* Footer */}
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

/** Render release sections */
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
