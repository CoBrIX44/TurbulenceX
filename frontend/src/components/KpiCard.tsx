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
    ok: 'text-green-300',
    warn: 'text-amber-300',
    crit: 'text-red-300',
    cyan: 'text-cyan-200',
    recover: 'text-emerald-200',
  }[tone]
  const bar = { neutral: 'bg-ink-500', ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', cyan: 'bg-sky-accent', recover: 'bg-recover' }[tone]
  return (
    <div title={hint} className="relative overflow-hidden rounded-xl border border-ink-700/80 bg-ink-850/80 px-3.5 py-3 transition-colors hover:border-ink-600">
      <span className={cn('absolute inset-y-0 left-0 w-0.5', bar)} />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-400">{label}</span>
        {icon && <span className="text-ink-500">{icon}</span>}
      </div>
      <div className={cn('num mt-1.5 text-2xl font-semibold leading-none', accent)}>{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-ink-400">
        {sub}
        {delta && delta.value !== 0 && (
          <span className={cn('num font-medium', delta.value < 0 === (delta.goodWhenNegative ?? true) ? 'text-emerald-300' : 'text-red-300')}>
            {delta.value > 0 ? '+' : ''}
            {delta.value}
          </span>
        )}
      </div>
    </div>
  )
}
