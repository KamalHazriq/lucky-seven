import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { submitFeedback } from '../lib/gameService'
import { CURRENT_VERSION } from '../constants/releases'

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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.85, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, y: 20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.7 }}
            className="bg-slate-800 border border-slate-600 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-amber-300">Send Feedback</h3>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-sm"
              >
                &times;
              </button>
            </div>

            {sent ? (
              <div className="text-center py-6">
                <p className="text-2xl mb-2">{'\u2705'}</p>
                <p className="text-slate-200 font-medium">Thank you for your feedback!</p>
                <p className="text-xs text-slate-400 mt-1">We appreciate you helping improve Lucky Seven.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Rating */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">Rating</label>
                  <div className="flex gap-2 justify-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setRating(n)}
                        className={`w-10 h-10 rounded-full text-lg transition-all cursor-pointer ${
                          rating >= n
                            ? 'bg-amber-500 text-white scale-110'
                            : 'bg-slate-700 text-slate-500 hover:bg-slate-600'
                        }`}
                      >
                        {'\u2605'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Name (optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Anonymous"
                    maxLength={30}
                    className="w-full px-3 py-2 bg-slate-900/80 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Message */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What do you think? Any bugs or suggestions?"
                    maxLength={500}
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-900/80 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
                  />
                  <p className="text-[10px] text-slate-600 text-right mt-0.5">{message.length}/500</p>
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={busy}
                  className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-all cursor-pointer"
                >
                  {busy ? 'Sending...' : 'Send Feedback'}
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
