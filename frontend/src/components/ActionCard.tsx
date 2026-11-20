import { AlertTriangle, CheckCircle2, ChevronDown, ShieldCheck, XCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { Check, ImpactDelta, RecoveryAction } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSim } from '@/store/useSim'

export function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1">
      {checks.map((c, i) => (
        <li key={i} className="flex items-start gap-1.5 text-[11px]">
          {c.passed ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-ok" /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-crit" />}
          <span className="text-ink-300">
            <span className="font-mono text-ink-500">{c.check}</span> — {c.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function ImpactGrid({ impact }: { impact: ImpactDelta }) {
  const cells: [string, ReactNode, boolean][] = [
    ['Delay reduction', `${impact.delay_reduction_min > 0 ? '−' : ''}${Math.abs(impact.delay_reduction_min)} min`, impact.delay_reduction_min > 0],
    ['Passengers protected', impact.pax_protected, impact.pax_protected > 0],
    [
      'Missed-conn. pax',
      `${impact.missed_connection_pax_before} → ${impact.missed_connection_pax_after}`,
      impact.missed_connection_pax_after < impact.missed_connection_pax_before,
    ],
    ['Delayed flights', `${impact.delayed_flights_before} → ${impact.delayed_flights_after}`, impact.delayed_flights_after < impact.delayed_flights_before],
    ['Crew violations', `${impact.crew_violations_before} → ${impact.crew_violations_after}`, impact.crew_violations_after < impact.crew_violations_before],
    ['Impact index', `−${impact.impact_reduction}`, impact.impact_reduction > 0],
  ]
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {cells.map(([k, v, good]) => (
        <div key={k} className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wider text-ink-500">{k}</div>
          <div className={cn('num text-xs font-semibold', good ? 'text-emerald-300' : 'text-ink-200')}>{v}</div>
        </div>
      ))}
    </div>
  )
}

export function ActionCard({
  title,
  badges,
  reason,
  reasonLabel,
  action,
  impact,
  flights,
  tradeOffs,
  risks,
  checks,
  feasibility,
  applyLabel = 'Apply & re-simulate',
  testId,
}: {
  title: string
  badges?: ReactNode
  reason?: string
  reasonLabel?: ReactNode
  action: RecoveryAction
  impact: ImpactDelta | null
  flights: string[]
  tradeOffs: string[]
  risks: string[]
  checks: Check[]
  feasibility: string
  applyLabel?: string
  testId?: string
}) {
  const { applyAction, running, inspect, scenario } = useSim()
  const [open, setOpen] = useState(false)
  const already = scenario.actions.some((a) => JSON.stringify(a) === JSON.stringify(action))
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/80 p-3.5 transition-colors hover:border-ink-600" data-testid={testId}>
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink-100">{title}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {badges}
            <Badge tone={feasibility === 'feasible' ? 'ok' : feasibility === 'infeasible' ? 'crit' : 'warn'}>
              <ShieldCheck className="h-3 w-3" /> {feasibility.replaceAll('_', ' ')}
            </Badge>
          </div>
        </div>
        <Button
          variant="recover"
          size="sm"
          disabled={running || already || feasibility === 'infeasible'}
          onClick={() => void applyAction(action)}
          data-testid={testId ? `${testId}-apply` : undefined}
        >
          {already ? 'Applied' : applyLabel}
        </Button>
      </div>
      {reason && (
        <div className="mt-2.5 text-xs leading-relaxed text-ink-300">
          {reasonLabel && <div className="mb-0.5 text-[10px] uppercase tracking-wider text-ink-500">{reasonLabel}</div>}
          {reason}
        </div>
      )}
      {impact && (
        <div className="mt-2.5">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">Engine-computed impact</div>
          <ImpactGrid impact={impact} />
        </div>
      )}
      {flights.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
          <span className="text-ink-500">Flights affected:</span>
          {flights.slice(0, 14).map((f) => (
            <button key={f} onClick={() => inspect(f)} className="num cursor-pointer rounded bg-ink-800 px-1.5 py-0.5 text-cyan-200 hover:bg-ink-700">
              {f}
            </button>
          ))}
          {flights.length > 14 && <span className="text-ink-500">+{flights.length - 14}</span>}
        </div>
      )}
      {(tradeOffs.length > 0 || risks.length > 0) && (
        <div className="mt-2 space-y-1">
          {tradeOffs.map((t, i) => (
            <div key={`t${i}`} className="flex items-start gap-1.5 text-[11px] text-amber-200/90">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> Trade-off: {t}
            </div>
          ))}
          {risks.map((t, i) => (
            <div key={`r${i}`} className="flex items-start gap-1.5 text-[11px] text-ink-400">
              <AlertTriangle className="mt-px h-3 w-3 shrink-0" /> Risk: {t}
            </div>
          ))}
        </div>
      )}
      <button onClick={() => setOpen((o) => !o)} className="mt-2 flex cursor-pointer items-center gap-1 text-[11px] text-ink-400 hover:text-ink-200">
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} /> Aircraft & crew feasibility checks ({checks.length})
      </button>
      {open && (
        <div className="mt-1.5">
          <ChecksList checks={checks} />
        </div>
      )}
    </div>
  )
}
