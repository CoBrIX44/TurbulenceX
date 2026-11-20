import { CloudLightning, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Textarea } from '@/components/ui/form'
import { DISRUPTION_TYPES, typeLabel } from '@/lib/labels'
import { fmt, parseHHMM } from '@/lib/time'
import { validateDisruption } from '@/lib/validation'
import type { Disruption, DisruptionType } from '@/lib/types'
import { useSim } from '@/store/useSim'

function nextId(existing: Disruption[]): string {
  let i = 1
  while (existing.some((d) => d.id === `D${i}`)) i++
  return `D${i}`
}

export function DisruptionForm({ initial, onSubmit, onCancel }: { initial: Disruption; onSubmit: (d: Disruption) => void; onCancel?: () => void }) {
  const network = useSim((s) => s.network)
  const model = useSim((s) => s.model)
  const [d, setD] = useState<Disruption>(initial)
  const [touched, setTouched] = useState(false)
  const airports = network?.airports.map((a) => a.id) ?? []
  const errors = validateDisruption(d, airports)
  const valid = Object.keys(errors).length === 0
  const start = parseHHMM(d.start)
  const typeInfo = DISRUPTION_TYPES.find((t) => t.value === d.type)
  const cap = network?.airports.find((a) => a.id === d.airport)?.capacity_per_hour
  const setType = (type: DisruptionType) => {
    const def = model?.default_reduction_pct[type] ?? 100
    setD({
      ...d,
      type,
      capacity_reduction_pct: type === 'airport_closure' ? 100 : type === 'ground_handling' ? 0 : def,
      extra_turnaround_min: type === 'ground_handling' ? d.extra_turnaround_min || 30 : 0,
    })
  }
  return (
    <form
      className="space-y-3"
      data-testid="disruption-form"
      onSubmit={(e) => {
        e.preventDefault()
        setTouched(true)
        if (valid) onSubmit(d)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Airport" error={touched ? errors.airport : null}>
          <Select value={d.airport} onChange={(e) => setD({ ...d, airport: e.target.value })} data-testid="dis-airport">
            <option value="">Select…</option>
            {network?.airports.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id} · {a.city}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Disruption type">
          <Select value={d.type} onChange={(e) => setType(e.target.value as DisruptionType)} data-testid="dis-type">
            {DISRUPTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start (IST)" error={touched || d.start.length >= 5 ? errors.start : null}>
          <Input value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} placeholder="08:00" maxLength={5} data-testid="dis-start" />
        </Field>
        <Field label="Duration (min)" error={errors.duration} hint={start !== null && !errors.duration ? `Ends ${fmt(start + d.duration_min)}` : undefined}>
          <Input
            type="number"
            min={5}
            max={1440}
            step={5}
            value={d.duration_min}
            onChange={(e) => setD({ ...d, duration_min: Number(e.target.value) })}
            data-testid="dis-duration"
          />
        </Field>
      </div>
      {d.type === 'ground_handling' ? (
        <Field label={`Severity — extra turnaround: ${d.extra_turnaround_min} min`} error={errors.severity}>
          <input
            type="range"
            aria-label="Extra turnaround minutes"
            min={5}
            max={180}
            step={5}
            value={d.extra_turnaround_min}
            onChange={(e) => setD({ ...d, extra_turnaround_min: Number(e.target.value) })}
            className="w-full accent-amber-400"
          />
        </Field>
      ) : d.type === 'airport_closure' ? (
        <div className="rounded-lg border border-crit/30 bg-crit/5 px-3 py-2 text-xs text-red-200">
          Full closure: no arrivals or departures during the window.
        </div>
      ) : (
        <Field
          label={`Severity — capacity reduction: ${d.capacity_reduction_pct}%`}
          error={errors.severity}
          hint={
            cap !== undefined
              ? `${d.airport}: ${cap} → ${Math.floor((cap * (100 - d.capacity_reduction_pct)) / 100)} movements/hour${d.capacity_reduction_pct >= 100 ? ' (closed)' : ''}`
              : undefined
          }
        >
          <input
            type="range"
            aria-label="Capacity reduction percentage"
            min={10}
            max={100}
            step={5}
            value={d.capacity_reduction_pct}
            onChange={(e) => setD({ ...d, capacity_reduction_pct: Number(e.target.value) })}
            className="w-full accent-amber-400"
            data-testid="dis-severity"
          />
        </Field>
      )}
      <p className="text-[11px] text-ink-400">
        <span className="text-ink-300">Model:</span> {typeInfo?.model}
      </p>
      <Field label="Description (optional)">
        <Textarea
          rows={2}
          value={d.description}
          onChange={(e) => setD({ ...d, description: e.target.value.slice(0, 200) })}
          placeholder="e.g. Thunderstorm cell over the field"
        />
      </Field>
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={touched && !valid} data-testid="dis-submit">
          {initial.airport ? 'Update disruption' : 'Add disruption'}
        </Button>
      </div>
    </form>
  )
}

export function DisruptionPanel() {
  const { scenario, addDisruption, updateDisruption, removeDisruption, run, resetBaseline, dirty, running } = useSim()
  const [editing, setEditing] = useState<string | 'new' | null>(scenario.disruptions.length ? null : 'new')
  const blank: Disruption = {
    id: nextId(scenario.disruptions),
    airport: '',
    type: 'airport_closure',
    start: '08:00',
    duration_min: 90,
    capacity_reduction_pct: 100,
    extra_turnaround_min: 0,
    description: '',
  }
  return (
    <div className="space-y-3">
      {scenario.disruptions.length === 0 && editing !== 'new' && (
        <p className="text-xs text-ink-400">No disruptions — the network is running its baseline schedule.</p>
      )}
      {scenario.disruptions.map((d) =>
        editing === d.id ? (
          <div key={d.id} className="rounded-lg border border-sky-accent/40 bg-ink-900 p-3">
            <DisruptionForm
              initial={d}
              onSubmit={(nd) => {
                updateDisruption(d.id, nd)
                setEditing(null)
              }}
              onCancel={() => setEditing(null)}
            />
          </div>
        ) : (
          <div key={d.id} className="flex items-start gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3" data-testid={`disruption-${d.id}`}>
            <CloudLightning className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="num font-semibold text-ink-100">{d.airport}</span>
                <Badge tone="warn">{typeLabel(d.type)}</Badge>
                <span className="num text-xs text-ink-300">
                  {d.start}–{fmt((parseHHMM(d.start) ?? 0) + d.duration_min)} · {d.duration_min}m
                </span>
              </div>
              <div className="mt-1 text-xs text-ink-400">
                {d.type === 'ground_handling'
                  ? `+${d.extra_turnaround_min} min turnaround`
                  : d.type === 'airport_closure'
                    ? 'Closed'
                    : `${d.capacity_reduction_pct}% capacity reduction`}
                {d.description && ` · ${d.description}`}
              </div>
            </div>
            <Button size="icon" variant="ghost" aria-label={`Edit ${d.id}`} onClick={() => setEditing(d.id)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" aria-label={`Remove ${d.id}`} onClick={() => removeDisruption(d.id)}>
              <Trash2 className="h-3.5 w-3.5 text-red-300" />
            </Button>
          </div>
        ),
      )}
      {editing === 'new' ? (
        <div className="rounded-lg border border-sky-accent/40 bg-ink-900 p-3">
          <DisruptionForm
            key={blank.id}
            initial={blank}
            onSubmit={(d) => {
              addDisruption(d)
              setEditing(null)
            }}
            onCancel={scenario.disruptions.length ? () => setEditing(null) : undefined}
          />
        </div>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setEditing('new')} data-testid="add-disruption">
          <Plus className="h-4 w-4" /> Add disruption
        </Button>
      )}
      <div className="flex gap-2 pt-1">
        <Button variant="primary" className="flex-1" onClick={() => void run()} disabled={running} data-testid="panel-run">
          Run simulation{dirty ? ' •' : ''}
        </Button>
        <Button variant="ghost" onClick={() => void resetBaseline()} data-testid="reset-baseline">
          Reset to baseline
        </Button>
      </div>
    </div>
  )
}
