import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { submitFeedback } from '../lib/supabaseGameService'
import { CURRENT_VERSION } from '../constants/releases'
import { trackEvent } from '../lib/analytics'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

const COOLDOWN_MS = 5000
const DEV_MAX_ATTEMPTS = 5
const DEV_WINDOW_MS = 60_000

interface FeedbackModalProps {
  open: boolean
  onClose: () => void
  /** If provided, feedback modal can trigger dev mode activation */
  onDevActivate?: (code: string) => Promise<void>
}

export default function FeedbackModal({ open, onClose, onDevActivate }: FeedbackModalProps) {
  const [rating, setRating] = useState(0)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const lastSubmitRef = useRef(0)
  const devAttemptsRef = useRef<number[]>([])

  const handleSubmit = async () => {
    // Check if this is a dev mode activation attempt
    const isDevAttempt = message.trim() === 'devmode' && name.trim().length > 0

    if (isDevAttempt && onDevActivate) {
      // Rate limit: max 5 dev attempts per minute
      const now = Date.now()
      devAttemptsRef.current = devAttemptsRef.current.filter((t) => now - t < DEV_WINDOW_MS)
      if (devAttemptsRef.current.length >= DEV_MAX_ATTEMPTS) {
        toast.error('Too many attempts. Try again in a minute.')
        return
      }
      devAttemptsRef.current.push(now)

      setBusy(true)
      try {
        await onDevActivate(name.trim())
        // Success — do NOT save to feedback, close modal
        toast.success('Developer mode activated')
        handleClose()
      } catch {
        // Invalid code — submit as normal feedback silently
        await submitNormalFeedback()
      } finally {
        setBusy(false)
      }
      return
    }

    // Normal feedback flow
    if (rating === 0) return toast.error('Please select a rating')
    if (Date.now() - lastSubmitRef.current < COOLDOWN_MS) {
      return toast.error('Please wait a few seconds before submitting again')
    }
    if (!message.trim()) return toast.error('Please write a message')
    setBusy(true)
    try {
      await submitNormalFeedback()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const submitNormalFeedback = async () => {
    const theme = document.documentElement.getAttribute('data-theme') ?? 'blue'
    await submitFeedback({
      rating: rating || 3,
      name: name.trim() || 'Anonymous',
      message: message.trim(),
      appVersion: CURRENT_VERSION,
      theme,
    })
    lastSubmitRef.current = Date.now()
    setSent(true)
    trackEvent('feedback_submitted', { rating: rating || 3 })
    toast.success('Feedback sent! Thank you!')
  }

  const handleClose = () => {
    onClose()
    // Reset after close animation
    setTimeout(() => {
      setRating(0)
      setName('')
      setMessage('')
      setSent(false)
    }, 300)
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent
        className="max-w-sm rounded-2xl border-slate-700/60 bg-slate-800/95 backdrop-blur-md shadow-2xl shadow-black/40 p-0 gap-0"
        showCloseButton={false}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold text-amber-300">
              Send Feedback
            </DialogTitle>
            <button
              onClick={handleClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-slate-700/60 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-xs"
            >
              {'\u2715'}
            </button>
          </div>
          <DialogDescription className="text-xs text-slate-400">
            Help us improve Lucky Seven
          </DialogDescription>
        </DialogHeader>

        <Separator className="bg-slate-700/40 mt-3" />

        {/* Body */}
        <div className="px-5 py-4">
          {sent ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-6"
            >
              <p className="text-3xl mb-3">{'\u2705'}</p>
              <p className="text-slate-200 font-semibold">Thank you!</p>
              <p className="text-xs text-slate-400 mt-1">
                Your feedback helps improve Lucky Seven.
              </p>
              <Button
                onClick={handleClose}
                className="mt-5 w-full bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl h-10"
              >
                Close
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {/* Rating */}
              <div className="space-y-2">
                <Label className="text-xs text-slate-400">Rating</Label>
                <div className="flex gap-1.5 justify-center">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <motion.button
                      key={n}
                      whileHover={{ scale: 1.15 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setRating(n)}
                      className={cn(
                        'w-10 h-10 rounded-full text-lg transition-all cursor-pointer',
                        rating >= n
                          ? 'bg-amber-500 text-white shadow-md shadow-amber-500/25'
                          : 'bg-slate-700/60 text-slate-500 hover:bg-slate-600/80 hover:text-slate-400'
                      )}
                    >
                      {'\u2605'}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-1.5">
                <Label htmlFor="feedback-name" className="text-xs text-slate-400">
                  Name <span className="text-slate-600">(optional)</span>
                </Label>
                <Input
                  id="feedback-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Anonymous"
                  maxLength={30}
                  className="h-10 rounded-xl border-slate-600/60 bg-slate-900/60 text-white placeholder:text-slate-500 focus-visible:border-amber-500/60 focus-visible:ring-amber-500/20"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="feedback-message" className="text-xs text-slate-400">
                    Message
                  </Label>
                  <span className="text-[10px] text-slate-600 tabular-nums">
                    {message.length}/500
                  </span>
                </div>
                <Textarea
                  id="feedback-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What do you think? Any bugs or suggestions?"
                  maxLength={500}
                  rows={3}
                  className="rounded-xl border-slate-600/60 bg-slate-900/60 text-white placeholder:text-slate-500 focus-visible:border-amber-500/60 focus-visible:ring-amber-500/20 resize-none min-h-[80px]"
                />
              </div>

              {/* Submit */}
              <Button
                onClick={handleSubmit}
                disabled={busy}
                className="w-full h-10 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-semibold shadow-lg shadow-amber-600/15 cursor-pointer"
              >
                {busy ? 'Sending...' : 'Send Feedback'}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
