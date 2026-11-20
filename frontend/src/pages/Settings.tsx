import { CheckCircle2, Cpu, Database, ShieldCheck, SlidersHorizontal, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Page } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Select, Switch } from '@/components/ui/form'
import { Spinner } from '@/components/ui/misc'
import { api } from '@/lib/api'
import { SPEEDS } from '@/lib/playback'
import type { ValidationReport } from '@/lib/types'
import { useSim } from '@/store/useSim'

export function SettingsPage() {
  const s = useSim()
  const m = s.model
  const [val, setVal] = useState<ValidationReport | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api
      .validation()
      .then(setVal)
      .catch((e) => setErr((e as Error).message))
  }, [])
  return (
    <Page title="Settings" subtitle="Dataset integrity, modelling assumptions, AI provider and playback preferences">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            icon={<Database className="h-4 w-4" />}
            title="Dataset validation"
            subtitle="Checks run against flight_network.json — problems are reported, never silently fixed"
          />
          <CardBody className="space-y-2" data-testid="validation-report">
            {err && <p className="text-xs text-red-300">{err}</p>}
            {!val && !err && <Spinner />}
            {val && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={val.valid ? 'ok' : 'crit'}>{val.valid ? 'VALID' : 'ISSUES FOUND'}</Badge>
                  <span className="font-mono text-[10px] text-ink-500">sha256 {val.checksum.slice(0, 16)}…</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {Object.entries(val.counts).map(([k, v]) => (
                    <div key={k} className="rounded-md border border-ink-700 bg-ink-900 px-2 py-1">
                      <div className="text-[10px] uppercase text-ink-500">{k.replace('_', ' ')}</div>
                      <div className="num">
                        {v} <span className="text-ink-500">/ {val.expected_counts[k]}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {val.checks.map((c) => (
                  <div key={c.id} className="flex items-start gap-2 text-xs">
                    {c.passed ? <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-ok" /> : <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-crit" />}
                    <div>
                      <div className="text-ink-200">{c.title}</div>
                      {c.issues.map((i, k) => (
                        <div key={k} className="text-ink-400">
                          {i}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader icon={<Cpu className="h-4 w-4" />} title="AI dispatcher provider" />
            <CardBody className="space-y-2 text-sm">
              {m?.llm.configured ? (
                <>
                  <Badge tone="ai">LLM configured</Badge>
                  <div className="text-xs text-ink-300">
                    Model <span className="font-mono">{m.llm.model}</span> via <span className="font-mono">{m.llm.base_url}</span> (OpenAI-compatible API)
                  </div>
                </>
              ) : (
                <>
                  <Badge tone="neutral">No LLM key — deterministic rule-based dispatcher active</Badge>
                  <p className="text-xs text-ink-400">
                    Set <span className="font-mono">LLM_API_KEY</span> (and optionally <span className="font-mono">LLM_BASE_URL</span>,{' '}
                    <span className="font-mono">LLM_MODEL</span>) in <span className="font-mono">backend/.env</span> and restart the backend.
                  </p>
                </>
              )}
              <p className="text-xs text-ink-500">Keys are read by the backend only and never sent to the browser.</p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<ShieldCheck className="h-4 w-4" />} title="Modelling assumptions (this scenario)" />
            <CardBody className="space-y-2">
              <Switch
                checked={s.scenario.settings.assume_standby_crew_for_spares}
                onChange={(v) => s.setSettings({ assume_standby_crew_for_spares: v })}
                label={<span className="text-sm">Standby crew available with spare aircraft</span>}
              />
              <p className="text-xs text-ink-400">
                The dataset has no reserve crews. When on, spare deployments use an explicitly labelled assumed standby crew (report 45 min before first
                departure, duty limit 600 min, as for dataset crews). Re-run to apply.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader icon={<SlidersHorizontal className="h-4 w-4" />} title="Engine parameters" subtitle="Read-only — from the backend" />
            <CardBody className="space-y-1 text-xs">
              {m &&
                (
                  [
                    ['Minimum turnaround (dataset)', `${m.min_turnaround_minutes} min`],
                    ['Seats per aircraft (dataset)', m.seats_per_aircraft],
                    ['Delay threshold (on-time if below)', `${m.delay_threshold_min} min`],
                    ['Severe delay', `≥ ${m.severe_delay_min} min`],
                    ['Crew report before first departure (derived from dataset)', `${m.crew_report_min} min`],
                    ['Impact index: cancelled passenger', `${m.cancelled_pax_penalty_min} pax-min`],
                    ['Impact index: missed-connection passenger', `${m.missed_connection_pax_penalty_min} pax-min`],
                    ['Health bands (OTP %)', m.health_bands.map(([v, l]) => `${l} ≥ ${v}`).join(' · ')],
                  ] as [string, string | number][]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-ink-800 py-1">
                    <span className="text-ink-400">{k}</span>
                    <span className="num text-right text-ink-200">{v}</span>
                  </div>
                ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Playback" />
            <CardBody>
              <Field label="Default playback speed">
                <Select value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))} className="w-40">
                  {SPEEDS.map((v) => (
                    <option key={v} value={v}>
                      {v} simulated min / s
                    </option>
                  ))}
                </Select>
              </Field>
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  )
}
