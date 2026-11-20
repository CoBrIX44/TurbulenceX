import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  delta,
  hint,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  tone?: 'neutral' | 'ok' | 'warn' | 'crit' | 'cyan' | 'recover'
  delta?: { value: number; goodWhenNegative?: boolean } | null
  hint?: string
}) {
  const accent = {
    neutral: 'text-ink-100',
    ok: 'text-emerald-300',
    warn: 'text-amber-300',
    crit: 'text-red-300',
    cyan: 'text-cyan-200',
    recover: 'text-emerald-200',
  }[tone]

  const iconAccent = {
    neutral: 'text-ink-400',
    ok: 'text-emerald-400',
    warn: 'text-amber-400',
    crit: 'text-red-400',
    cyan: 'text-cyan-400',
    recover: 'text-emerald-400',
  }[tone]

  return (
    <div
      title={hint}
      className="relative flex flex-col justify-between overflow-hidden rounded-xl border border-ink-700/80 bg-ink-900 px-3.5 py-3 transition-colors hover:border-ink-500/80"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-ink-400">{label}</span>
        {icon && <span className={iconAccent}>{icon}</span>}
      </div>
      <div className={cn('num mt-2 text-2xl font-semibold leading-none tracking-tight', accent)}>{value}</div>
      <div className="mt-2 flex items-center justify-between gap-2 border-t border-ink-800/80 pt-1.5 text-[11px] text-ink-400">
        <span className="truncate">{sub}</span>
        {delta && delta.value !== 0 && (
          <span
            className={cn(
              'num rounded px-1.5 py-0.5 text-[10px] font-semibold',
              delta.value < 0 === (delta.goodWhenNegative ?? true)
                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800/50'
                : 'bg-red-950/70 text-red-300 border border-red-800/50',
            )}
          >
            {delta.value > 0 ? '+' : ''}
            {delta.value}
          </span>
        )}
      </div>
    </div>
  )
}
