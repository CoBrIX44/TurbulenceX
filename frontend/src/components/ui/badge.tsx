import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const tones = {
  neutral: 'bg-ink-700/70 text-ink-200 border-ink-600',
  cyan: 'bg-sky-accent/10 text-cyan-200 border-sky-accent/40',
  ok: 'bg-ok/10 text-green-300 border-ok/40',
  warn: 'bg-warn/10 text-amber-300 border-warn/40',
  crit: 'bg-crit/10 text-red-300 border-crit/40',
  ai: 'bg-ai/10 text-violet-200 border-ai/40',
  recover: 'bg-recover/10 text-emerald-200 border-recover/40',
  muted: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
} as const

export type Tone = keyof typeof tones

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none', tones[tone], className)}
      {...props}
    />
  )
}
