import { useState, useMemo } from 'react'
import { RELEASES, CURRENT_VERSION } from '../constants/releases'
import type { ReleaseNote } from '../constants/releases'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Patch Notes</DialogTitle>
              <DialogDescription className="mt-0.5">
                Lucky Seven {CURRENT_VERSION}
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="ls-close-btn">
                {'\u2715'}
              </Button>
            </DialogClose>
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
                    ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                    : 'bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground'
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

        <Separator className="mt-3" />

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="px-5 py-3">
            <Accordion type="multiple" defaultValue={[allVersions[0]?.version ?? '']} className="space-y-1.5">
              {allVersions.map((release) => (
                <AccordionItem
                  key={release.version}
                  value={release.version}
                  className="border-0 rounded-xl bg-surface-panel overflow-hidden"
                >
                  <AccordionTrigger className="px-3 py-2.5 hover:no-underline hover:bg-surface-panel/80 rounded-xl [&[data-state=open]]:rounded-b-none">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-bold text-amber-300 border-amber-500/30 bg-amber-500/10 px-1.5 py-0"
                      >
                        {release.version}
                      </Badge>
                      <span className="text-xs text-foreground">{release.title}</span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 pb-3 pt-0">
                    <p className="text-[10px] text-muted-foreground/60 mb-2.5">{release.date}</p>
                    {release.sections.map((section, si) => (
                      <div key={si} className="mb-3 last:mb-0">
                        <h5 className="text-[10px] font-semibold text-primary/80 uppercase tracking-wider mb-1.5">
                          {section.heading}
                        </h5>
                        <ul className="space-y-1">
                          {section.items.map((item, i) => (
                            <li key={i} className="flex gap-2 text-xs text-foreground/80 leading-relaxed">
                              <span className="text-primary/50 shrink-0 mt-0.5">{'\u2022'}</span>
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
        </div>

        {/* Footer */}
        <Separator />
        <div className="px-5 py-3 shrink-0 space-y-2">
          <p className="text-[10px] text-muted-foreground text-center">
            Created by Kamal Hazriq &middot; Idea by Imaduddin
          </p>
          <p className="text-[10px] text-muted-foreground/50 text-center">
            Lucky Seven&trade; is a fan-made game implementation.
          </p>
          {onOpenFeedback && (
            <Button
              onClick={onOpenFeedback}
              variant="outline"
              className="w-full h-10 rounded-xl text-xs"
            >
              Send Feedback
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
