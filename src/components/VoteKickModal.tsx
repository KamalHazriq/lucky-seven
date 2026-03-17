import type { VoteKick } from '../lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'

interface Props {
  voteKick: VoteKick | null
  localPlayerId: string
  onVoteYes: () => void
  onVoteNo: () => void
  onCancel?: () => void
  isInitiatorOrHost?: boolean
}

export default function VoteKickModal({ voteKick, localPlayerId, onVoteYes, onVoteNo, onCancel, isInitiatorOrHost }: Props) {
  if (!voteKick?.active) return null

  const isTarget = localPlayerId === voteKick.targetId
  const alreadyVoted = voteKick.votes.includes(localPlayerId)
  const canVote = !isTarget && !alreadyVoted
  const progressPct = (voteKick.votes.length / voteKick.requiredVotes) * 100

  return (
    <Dialog open={voteKick.active} modal>
      <DialogContent
        className="max-w-xs"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex flex-col items-center text-center gap-2">
            <span className="text-3xl">{'\u{1F6AB}'}</span>
            <DialogTitle className="text-destructive">
              Vote to Kick
            </DialogTitle>
            <DialogDescription className="text-foreground">
              {isTarget
                ? 'A vote to kick you is in progress...'
                : <>Kick <span className="font-bold text-white">{voteKick.targetName}</span>?</>
              }
            </DialogDescription>
          </div>
        </DialogHeader>

        <Separator className="mt-3" />

        {/* Vote progress section */}
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-xl border border-border-subtle bg-surface-panel p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="uppercase tracking-wider">Votes</Label>
              <Badge
                variant="outline"
                className="font-mono text-[11px] border-red-500/30 bg-red-500/10 text-red-400 px-2 py-0.5"
                aria-live="polite"
                aria-atomic="true"
                aria-label={`${voteKick.votes.length} of ${voteKick.requiredVotes} votes`}
              >
                {voteKick.votes.length} / {voteKick.requiredVotes}
              </Badge>
            </div>
            <Progress
              value={progressPct}
              className="h-2.5 bg-secondary"
              indicatorClassName="bg-red-500"
            />
          </div>

          {/* State-dependent content */}
          {isTarget ? (
            <p className="text-xs text-muted-foreground text-center py-1">
              Waiting for other players to vote...
            </p>
          ) : alreadyVoted ? (
            <div className="flex items-center justify-center gap-2 py-1">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs px-2.5 py-1">
                {'\u2713'} You voted — waiting for others...
              </Badge>
            </div>
          ) : canVote ? (
            <div className="flex gap-2.5">
              <Button
                variant="destructive"
                onClick={onVoteYes}
                className="flex-1 h-11 rounded-xl text-sm"
              >
                Kick
              </Button>
              <Button
                variant="outline"
                onClick={onVoteNo}
                className="flex-1 h-11 rounded-xl text-sm"
              >
                Keep
              </Button>
            </div>
          ) : null}

          {/* Cancel vote — only initiator or host, only when not the target */}
          {isInitiatorOrHost && !isTarget && onCancel && (
            <>
              <Separator />
              <Button
                variant="ghost"
                onClick={onCancel}
                className="w-full h-9 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel vote
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
