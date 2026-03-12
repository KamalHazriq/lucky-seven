import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SPRING_MODAL = { type: 'spring' as const, stiffness: 300, damping: 24, mass: 0.7 }

interface DevModeModalProps {
  open: boolean
  onClose: () => void
  onActivate: (code: string) => Promise<void>
  loading: boolean
  error: string | null
}

export default function DevModeModal({
  open,
  onClose,
  onActivate,
  loading,
  error,
}: DevModeModalProps) {
  const [code, setCode] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || loading) return
    setSuccess(false)
    try {
      await onActivate(code.trim())
      setSuccess(true)
      setTimeout(() => {
        setCode('')
        setSuccess(false)
        onClose()
      }, 1200)
    } catch {
      // Error is set by the hook
    }
  }

  const handleClose = () => {
    setCode('')
    setSuccess(false)
    onClose()
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
            transition={SPRING_MODAL}
            className="bg-slate-800 border border-amber-600/40 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">🛠️</span>
                <h3 className="text-lg font-bold text-amber-300">Developer Mode</h3>
              </div>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/80 hover:bg-slate-600 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer text-sm"
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-4">
              Enter the developer access code to enable privileged features for your account only.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter access code..."
                autoFocus
                disabled={loading || success}
                className="w-full px-4 py-3 rounded-xl bg-slate-900/60 border border-slate-600/50 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 disabled:opacity-50 transition-colors"
              />

              {/* Error message */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/30 border border-red-700/40"
                >
                  <span className="text-xs">❌</span>
                  <span className="text-xs text-red-300">{error}</span>
                </motion.div>
              )}

              {/* Success message */}
              {success && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-900/30 border border-emerald-700/40"
                >
                  <span className="text-xs">✅</span>
                  <span className="text-xs text-emerald-300 font-medium">Developer mode activated!</span>
                </motion.div>
              )}

              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={!code.trim() || loading || success}
                className="w-full py-3 rounded-xl bg-amber-600/80 hover:bg-amber-500/80 text-white font-semibold text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : success ? (
                  '✅ Activated'
                ) : (
                  '🔓 Activate Developer Mode'
                )}
              </motion.button>
            </form>

            <p className="mt-3 text-[10px] text-slate-500 text-center">
              Access is tied to your player session only. Other players will not be affected.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
