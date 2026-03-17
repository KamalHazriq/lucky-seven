import { useState } from 'react'
import { motion } from 'framer-motion'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

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
  const [showCode, setShowCode] = useState(false)

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
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose() }}>
      <DialogContent className="sm:max-w-sm">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{'\u{1F6E0}\uFE0F'}</span>
              <DialogTitle>Developer Mode</DialogTitle>
            </div>
            <DialogClose asChild>
              <Button variant="ghost" size="sm" className="ls-close-btn" onClick={handleClose}>
                {'\u2715'}
              </Button>
            </DialogClose>
          </div>
          <DialogDescription className="mt-1">
            Enter the developer access code to enable privileged features for your account only.
          </DialogDescription>
        </DialogHeader>

        <Separator className="mt-3" />

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dev-code">
              Access Code
            </Label>
            <div className="relative">
              <Input
                id="dev-code"
                type={showCode ? 'text' : 'password'}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Enter access code..."
                autoFocus
                disabled={loading || success}
                className="h-10 pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowCode((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                tabIndex={-1}
                aria-label={showCode ? 'Hide code' : 'Show code'}
              >
                {showCode ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-900/25 border border-red-700/30"
            >
              <span className="text-xs">{'\u274C'}</span>
              <span className="text-xs text-red-400">{error}</span>
            </motion.div>
          )}

          {/* Success */}
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-900/25 border border-emerald-700/30"
            >
              <span className="text-xs">{'\u2705'}</span>
              <span className="text-xs text-emerald-300 font-medium">Developer mode activated!</span>
            </motion.div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={!code.trim() || loading || success}
            variant="success"
            className="w-full h-10 rounded-xl"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Verifying...
              </span>
            ) : success ? (
              '\u2705 Activated'
            ) : (
              '\u{1F513} Activate Developer Mode'
            )}
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            Access is tied to your player session only. Other players will not be affected.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
