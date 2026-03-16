import { useState } from 'react'
import { CURRENT_VERSION } from '../constants/releases'
import PatchNotesModal from './PatchNotesModal'

interface VersionLabelProps {
  onOpenFeedback?: () => void
}

export default function VersionLabel({ onOpenFeedback }: VersionLabelProps) {
  const [showNotes, setShowNotes] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowNotes(true)}
        className="fixed bottom-2 left-3 text-xs font-medium pointer-events-auto select-none z-10 cursor-pointer hover:opacity-80 transition-opacity"
        style={{ color: 'var(--watermark)' }}
        title="View patch notes"
      >
        Lucky Seven {CURRENT_VERSION}
      </button>
      <PatchNotesModal
        open={showNotes}
        onClose={() => setShowNotes(false)}
        onOpenFeedback={onOpenFeedback ? () => { setShowNotes(false); onOpenFeedback() } : undefined}
      />
    </>
  )
}
