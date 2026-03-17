import { useState, useMemo } from 'react'
import { RELEASES, CURRENT_VERSION } from '../constants/releases'
import type { ReleaseNote } from '../constants/releases'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'
import { cn } from '@/lib/utils'

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
  const match = version.match(/^(v\d+\.\d+)/)
  return match ? match[1] : version
}

interface VersionGroup {
  key: string
  primary: ReleaseNote
  subs: ReleaseNote[]
}

export default function PatchNotesModal({ open, onClose, onOpenFeedback }: PatchNotesModalProps) {
  const [selectedGroupIdx, setSelectedGroupIdx] = useState(0)

  const groups = useMemo<VersionGroup[]>(() => {
    const groupMap = new Map<string, ReleaseNote[]>()
    for (const r of RELEASES) {
      const key = getVersionGroup(r.version)
      if (!groupMap.has(key)) groupMap.set(key, [])
      groupMap.get(key)!.push(r)
    }

    const result: VersionGroup[] = []
    for (const [key, releases] of groupMap) {
      const primary = releases.find((r) => r.version === key) ?? releases[releases.length - 1]
      const subs = releases.filter((r) => r !== primary)
      result.push({ key, primary, subs })
    }

    return result
  }, [])

  const currentGroup = groups[selectedGroupIdx]
  const allVersions = currentGroup ? [...currentGroup.subs, currentGroup.primary] : []

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent
        className="max-w-md rounded-2xl border-slate-700/60 bg-slate-800/95 backdrop-blur-md shadow-2xl shadow-black/40 p-0 gap-0 max-h-[85vh] flex flex-col"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold text-amber-300">
                Patch Notes
              </DialogTitle>
              <DialogDescription className="text-[11px] text-slate-500 mt-0.5">
                Lucky Seven {CURRENT_VERSION}
              </DialogDescription>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs"
            >
              {'\u2715'}
            </button>
          </div>
        </DialogHeader>

        {/* Version group tabs */}
        <div className="px-5 pt-3 pb-0 shrink-0">
          <div className="flex gap-1.5 flex-wrap">
            {groups.map((g, i) => (
              <button
                key={g.key}
                onClick={() => setSelectedGroupIdx(i)}
                className={cn(
                  'px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer',
                  selectedGroupIdx === i
                    ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/20'
                    : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/60 hover:text-slate-300'
                )}
              >
                {g.key}
                {g.subs.length > 0 && (
                  <span className="ml-1 text-[9px] opacity-60">+{g.subs.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <Separator className="bg-slate-700/40 mt-3" />

        {/* Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-5 py-3">
            <Accordion type="multiple" defaultValue={[allVersions[0]?.version ?? '']} className="space-y-1.5">
              {allVersions.map((release) => (
                <AccordionItem
                  key={release.version}
                  value={release.version}
                  className="border-0 rounded-xl bg-slate-700/20 overflow-hidden"
                >
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-slate-700/30 rounded-xl [&[data-state=open]]:rounded-b-none">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold text-amber-300 border-amber-500/30 bg-amber-500/10 px-1.5 py-0"
                      >
                        {release.version}
                      </Badge>
                      <span className="text-xs text-slate-300">{release.title}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 pt-0">
                    <p className="text-[10px] text-slate-500 mb-2.5">{release.date}</p>
                    {release.sections.map((section, si) => (
                      <div key={si} className="mb-3 last:mb-0">
                        <h5 className="text-[11px] font-semibold text-amber-400/80 uppercase tracking-wider mb-1.5">
                          {section.heading}
                        </h5>
                        <ul className="space-y-1">
                          {section.items.map((item, i) => (
                            <li key={i} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                              <span className="text-amber-500/60 shrink-0 mt-0.5">{'\u2022'}</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </ScrollArea>

        {/* Footer */}
        <Separator className="bg-slate-700/40" />
        <div className="px-5 py-3 shrink-0 space-y-2">
          <p className="text-[10px] text-slate-500 text-center">
            Created by Kamal Hazriq &middot; Idea by Imaduddin
          </p>
          <p className="text-[9px] text-slate-600 text-center">
            Lucky Seven&trade; is a fan-made game implementation.
          </p>
          {onOpenFeedback && (
            <Button
              onClick={onOpenFeedback}
              variant="ghost"
              className="w-full h-9 rounded-xl bg-slate-700/40 hover:bg-slate-700/70 text-xs text-slate-400 hover:text-slate-200 border border-slate-600/30"
            >
              Send Feedback
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
