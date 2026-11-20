import { Loader2, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-ink-500">{icon}</div>}
      <p className="text-sm font-medium text-ink-200">{title}</p>
      {children && <div className="max-w-md text-xs text-ink-400">{children}</div>}
      {action}
    </div>
  )
}

export function Tip({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('group relative inline-flex', className)}>
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-64 -translate-x-1/2 rounded-md border border-ink-600 bg-ink-850 px-2 py-1 text-[11px] leading-snug font-normal text-ink-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 'max-w-2xl',
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Inspector drawer'}
        className={cn('relative flex h-full w-full flex-col border-l border-ink-700 bg-ink-900 shadow-2xl animate-slide-in', width)}
      >
        <div className="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div className="min-w-0 text-sm font-semibold text-ink-100">{title}</div>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink-950/70 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog modal'}
        className="relative w-full max-w-md rounded-xl border border-ink-600 bg-ink-850 p-5 shadow-2xl animate-fade-in"
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink-100">{title}</div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="cursor-pointer rounded-md p-1 text-ink-400 hover:bg-ink-800 hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
