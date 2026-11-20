import { FlaskConical, GitCompare, Layers, ListChecks, Save, Search, Trash2, Undo2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ActionCard, ChecksList } from '@/components/ActionCard'
import { Page } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Segmented, Select } from '@/components/ui/form'
import { Empty, Spinner } from '@/components/ui/misc'
import { api } from '@/lib/api'
import { describeAction } from '@/lib/labels'
import { fmt } from '@/lib/time'
import type { EvaluatedAction, RecoveryAction } from '@/lib/types'
import { cn, n } from '@/lib/utils'
import { scenarioInput, useSim } from '@/store/useSim'

type Kind = RecoveryAction['type']

function ActionBuilder() {
  const s = useSim()
  const network = s.network!
  const current = s.result!.recovered ?? s.result!.disrupted
  const [kind, setKind] = useState<Kind>('deploy_spare')
  const usedSpares = new Set(s.scenario.actions.flatMap((a) => (a.type === 'deploy_spare' ? [a.spare_tail] : [])))
  const firstFree = network.spare_aircraft.find((x) => !usedSpares.has(x.tail_id))?.tail_id ?? network.spare_aircraft[0].tail_id
  const [spareChoice, setSpare] = useState<string | null>(null)
  const spare = spareChoice && !usedSpares.has(spareChoice) ? spareChoice : firstFree
  const [tail, setTail] = useState('')
  const [fromFlight, setFromFlight] = useState('')
  const [cancelIds, setCancelIds] = useState<string[]>([])
  const [fa, setFa] = useState('')
  const [fb, setFb] = useState('')
  const [conn, setConn] = useState('')
  const [hold, setHold] = useState(60)
  const [preview, setPreview] = useState<EvaluatedAction | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const legsOf = (t: string) => current.aircraft.find((a) => a.tail_id === t)?.flights.filter((f) => !f.startsWith('FERRY')) ?? []
  const fl = useMemo(() => Object.fromEntries(current.flights.map((f) => [f.flight_id, f])), [current])
  const activeTails = Object.keys(network.rotations)
  const swapCandidates = fa
    ? current.flights.filter(
        (f) => f.flight_id !== fa && f.status !== 'cancelled' && f.origin === fl[fa]?.origin && f.operating_tail !== fl[fa]?.operating_tail,
      )
    : []

  const action: RecoveryAction | null =
    kind === 'deploy_spare'
      ? tail && fromFlight
        ? { type: 'deploy_spare', spare_tail: spare, replace_tail: tail, from_flight: fromFlight }
        : null
      : kind === 'cancel_flights'
        ? cancelIds.length
          ? { type: 'cancel_flights', flight_ids: cancelIds }
          : null
        : kind === 'swap_aircraft'
          ? fa && fb
            ? { type: 'swap_aircraft', flight_a: fa, flight_b: fb }
            : null
          : conn
            ? { type: 'protect_connection', connection_id: conn, max_hold_min: hold }
            : null

  const check = async () => {
    if (!action) return
    setBusy(true)
    setErr(null)
    try {
      setPreview(await api.evaluate(scenarioInput(s.scenario), action))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader
        icon={<FlaskConical className="h-4 w-4" />}
        title="Build a recovery action"
        subtitle="Every action is checked for deterministic feasibility and simulated before it can be applied"
      />
      <CardBody className="space-y-3">
        <Segmented<Kind>
          value={kind}
          onChange={(k) => {
            setKind(k)
            setPreview(null)
          }}
          options={[
            { value: 'deploy_spare', label: 'Deploy spare' },
            { value: 'cancel_flights', label: 'Cancel' },
            { value: 'swap_aircraft', label: 'Reassign aircraft' },
            { value: 'protect_connection', label: 'Protect connection' },
          ]}
        />
        {kind === 'deploy_spare' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field
              label="Spare aircraft"
              hint={
                network.spare_aircraft.find((x) => x.tail_id === spare)
                  ? `Base ${network.spare_aircraft.find((x) => x.tail_id === spare)!.base} · from ${network.spare_aircraft.find((x) => x.tail_id === spare)!.available_from} · 180 seats`
                  : ''
              }
            >
              <Select
                value={spare}
                onChange={(e) => {
                  setSpare(e.target.value)
                  setPreview(null)
                }}
                data-testid="spare-select"
              >
                {network.spare_aircraft.map((x) => (
                  <option key={x.tail_id} value={x.tail_id} disabled={usedSpares.has(x.tail_id)}>
                    {x.tail_id} ({x.base}){usedSpares.has(x.tail_id) ? ' — in use' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Replace aircraft">
              <Select
                value={tail}
                onChange={(e) => {
                  setTail(e.target.value)
                  setFromFlight('')
                  setPreview(null)
                }}
                data-testid="replace-tail"
              >
                <option value="">Select…</option>
                {activeTails.map((t) => {
                  const a = current.aircraft.find((x) => x.tail_id === t)
                  return (
                    <option key={t} value={t}>
                      {t} {a && a.max_delay > 0 ? `(max +${a.max_delay}m)` : ''}
                    </option>
                  )
                })}
              </Select>
            </Field>
            <Field label="Take over from flight">
              <Select
                value={fromFlight}
                onChange={(e) => {
                  setFromFlight(e.target.value)
                  setPreview(null)
                }}
                disabled={!tail}
                data-testid="from-flight"
              >
                <option value="">Select…</option>
                {legsOf(tail).map((f) => (
                  <option key={f} value={f}>
                    {f} {fl[f]?.origin}→{fl[f]?.destination} {fmt(fl[f]?.sched_dep)} {fl[f]?.arr_delay ? `(+${fl[f].arr_delay}m)` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {kind === 'cancel_flights' && (
          <div className="space-y-2">
            <Field
              label="Flights to cancel"
              hint="Tip: cancel a round-trip pair (A→B and B→A) so the aircraft stays in position. Single cancellations strand the aircraft and cascade."
            >
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value && !cancelIds.includes(e.target.value)) setCancelIds([...cancelIds, e.target.value])
                  setPreview(null)
                }}
                data-testid="cancel-select"
              >
                <option value="">Add a flight…</option>
                {current.flights
                  .filter((f) => f.status !== 'cancelled')
                  .map((f) => (
                    <option key={f.flight_id} value={f.flight_id}>
                      {f.flight_id} {f.origin}→{f.destination} {fmt(f.sched_dep)} · {f.pax} pax {f.arr_delay ? `(+${f.arr_delay}m)` : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="flex flex-wrap gap-1.5">
              {cancelIds.map((id) => (
                <Badge key={id} tone="crit">
                  {id}
                  <button type="button" aria-label={`Remove ${id}`} className="cursor-pointer" onClick={() => setCancelIds(cancelIds.filter((x) => x !== id))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}
        {kind === 'swap_aircraft' && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delayed flight (aircraft A)">
              <Select
                value={fa}
                onChange={(e) => {
                  setFa(e.target.value)
                  setFb('')
                  setPreview(null)
                }}
              >
                <option value="">Select…</option>
                {current.flights
                  .filter((f) => f.status !== 'cancelled')
                  .map((f) => (
                    <option key={f.flight_id} value={f.flight_id}>
                      {f.flight_id} {f.origin}→{f.destination} {fmt(f.sched_dep)} on {f.operating_tail} {f.dep_delay ? `(+${f.dep_delay}m)` : ''}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field
              label="Exchange with (aircraft B, same origin)"
              hint="Remaining rotations are exchanged from these legs onward; crews stay with their aircraft."
            >
              <Select
                value={fb}
                onChange={(e) => {
                  setFb(e.target.value)
                  setPreview(null)
                }}
                disabled={!fa}
              >
                <option value="">Select…</option>
                {swapCandidates.map((f) => (
                  <option key={f.flight_id} value={f.flight_id}>
                    {f.flight_id} {f.origin}→{f.destination} {fmt(f.sched_dep)} on {f.operating_tail}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
        {kind === 'protect_connection' && (
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <Field label="Connection">
              <Select
                value={conn}
                onChange={(e) => {
                  setConn(e.target.value)
                  setPreview(null)
                }}
              >
                <option value="">Select…</option>
                {current.connections.map((c) => (
                  <option key={c.connection_id} value={c.connection_id}>
                    {c.connection_id} @{c.airport} {c.from_flight}→{c.to_flight} · {c.passengers} pax · {c.status}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Max hold (min)">
              <Input type="number" min={0} max={240} step={5} value={hold} onChange={(e) => setHold(Math.max(0, Math.min(240, Number(e.target.value))))} />
            </Field>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="primary" disabled={!action || busy} onClick={() => void check()} data-testid="check-feasibility">
            {busy ? <Spinner /> : <ListChecks className="h-4 w-4" />} Check feasibility & impact
          </Button>
          {err && <span className="text-xs text-red-300">{err}</span>}
        </div>
        {preview && (
          <div className="animate-fade-in" data-testid="feasibility-preview">
            {preview.feasible ? (
              <ActionCard
                testId="preview"
                title={describeAction(preview.action)}
                badges={<Badge tone="cyan">{preview.category}</Badge>}
                reason={preview.message}
                action={preview.action}
                impact={preview.impact}
                flights={preview.flights_affected}
                tradeOffs={preview.trade_offs}
                risks={preview.warnings}
                checks={preview.checks}
                feasibility={preview.feasibility_status}
              />
            ) : (
              <div className="rounded-xl border border-crit/40 bg-crit/5 p-3.5">
                <div className="mb-2 text-sm font-semibold text-red-200">Infeasible — {preview.message}</div>
                <ChecksList checks={preview.checks} />
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Comparison() {
  const s = useSim()
  const res = s.result!
  const c = res.comparison
  const hasRec = !!res.recovered
  const chart = c.rows
    .filter((r) => ['delayed', 'cancelled', 'missed_connections', 'crew_violations'].includes(r.metric))
    .map((r) => ({ name: r.label, Baseline: r.baseline, Disrupted: r.disrupted, Recovered: r.recovered ?? r.disrupted }))
  const better = (key: string, a: number, b: number) => (key === 'otp_pct' ? b > a : b < a)
  const neutral = (key: string) => key === 'spares_used'
  return (
    <Card>
      <CardHeader
        icon={<GitCompare className="h-4 w-4" />}
        title="Before / after comparison"
        subtitle="Baseline (no disruption) · Disrupted · Recovered (with applied actions) — all computed by the engine"
      />
      <CardBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-recover/40 bg-recover/5 p-3 text-center">
            <div className="num text-3xl font-semibold text-emerald-200" data-testid="recovery-pct">
              {hasRec && c.network_recovery_pct !== null ? `${c.network_recovery_pct}%` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-ink-400">Network recovery</div>
            <div className="mt-1 text-[10px] text-ink-500">Share of the disruption’s passenger impact index removed</div>
          </div>
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-3 text-center">
            <div className="num text-3xl font-semibold text-cyan-200">
              {hasRec && c.delay_minutes_recovery_pct !== null ? `${c.delay_minutes_recovery_pct}%` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-wider text-ink-400">Delay minutes recovered</div>
            <div className="mt-1 text-[10px] text-ink-500">Reduction in total arrival-delay minutes</div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border border-ink-700">
          <table className="w-full text-xs" data-testid="comparison-table">
            <caption className="sr-only">Baseline, Disrupted, and Recovered Operational Metrics Comparison</caption>
            <thead className="bg-ink-850 text-ink-400">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Metric</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Baseline</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Disrupted</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Recovered</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.metric} className="border-t border-ink-800">
                  <td className="px-3 py-1.5 text-ink-300 font-medium">{r.label}</td>
                  <td className="num px-3 py-1.5 text-right text-ink-400">{n(r.baseline)}</td>
                  <td className="num px-3 py-1.5 text-right text-amber-200">{n(r.disrupted)}</td>
                  <td
                    className={cn(
                      'num px-3 py-1.5 text-right',
                      r.recovered === undefined
                        ? 'text-ink-500'
                        : neutral(r.metric)
                          ? 'text-ink-200'
                          : better(r.metric, r.disrupted, r.recovered)
                            ? 'text-emerald-300'
                            : r.recovered === r.disrupted
                              ? 'text-ink-200'
                              : 'text-red-300',
                    )}
                  >
                    {r.recovered === undefined ? '—' : n(r.recovered)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chart} margin={{ left: -18, right: 8 }}>
            <CartesianGrid stroke="#16284a" vertical={false} />
            <XAxis dataKey="name" stroke="#37507c" fontSize={10} tick={{ fill: '#93a6c6' }} />
            <YAxis allowDecimals={false} stroke="#37507c" fontSize={11} tick={{ fill: '#93a6c6' }} />
            <Tooltip contentStyle={{ background: '#0b172c', border: '1px solid #22375e', borderRadius: 8, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Baseline" fill="#37507c" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Disrupted" fill="#f59e0b" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Recovered" fill="#34d399" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  )
}

function Suggestions() {
  const s = useSim()
  const [items, setItems] = useState<EvaluatedAction[] | null>(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    setBusy(true)
    try {
      setItems(await api.candidates(scenarioInput(s.scenario)))
    } catch (e) {
      s.notify('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Card>
      <CardHeader
        icon={<Search className="h-4 w-4" />}
        title="Engine-ranked candidates"
        subtitle="Deterministic search over spares, cancellations, swaps and connection holds"
        actions={
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy} data-testid="load-candidates">
            {busy ? <Spinner /> : null} {items ? 'Refresh' : 'Search'}
          </Button>
        }
      />
      <CardBody className="space-y-1.5">
        {!items && <p className="text-xs text-ink-400">Run a search to list every improving action for the current plan.</p>}
        {items?.length === 0 && <p className="text-xs text-ink-400">No further improving action found.</p>}
        {items?.slice(0, 10).map((c) => (
          <div key={c.candidate_id} className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 truncate text-ink-200" title={c.message}>
              {describeAction(c.action)}
            </span>
            <span className="num text-emerald-300">−{c.impact?.impact_reduction}</span>
            <Button size="sm" variant="recover" disabled={s.running} onClick={() => void s.applyAction(c.action).then(() => setItems(null))}>
              Apply
            </Button>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

export function RecoveryLabPage() {
  const s = useSim()
  const res = s.result!
  const outcomes = res.recovered?.actions ?? []
  const [label, setLabel] = useState('')
  if (!s.scenario.disruptions.length)
    return (
      <Page title="Recovery Lab" subtitle="Compare baseline, disrupted and recovered operations">
        <Card>
          <Empty
            icon={<FlaskConical className="h-7 w-7" />}
            title="Nothing to recover yet"
            action={
              <Link to="/simulations">
                <Button variant="outline" size="sm">
                  Configure a disruption
                </Button>
              </Link>
            }
          >
            Create and run a disruption first. Then deploy spares, cancel flights, reassign aircraft or protect connections here and compare the results.
          </Empty>
        </Card>
      </Page>
    )
  return (
    <Page
      title="Recovery Lab"
      subtitle="Apply feasible recovery actions — the simulation re-runs after every change"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => void s.undoAction()} disabled={!s.scenario.actions.length || s.running} data-testid="undo-action">
            <Undo2 className="h-3.5 w-3.5" /> Undo last
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void s.clearActions()} disabled={!s.scenario.actions.length || s.running}>
            <Trash2 className="h-3.5 w-3.5" /> Clear all actions
          </Button>
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <ActionBuilder />
          <Card>
            <CardHeader
              icon={<Layers className="h-4 w-4" />}
              title="Applied recovery plan"
              subtitle={`${s.scenario.actions.length} action(s), applied in order`}
            />
            <CardBody className="space-y-2" data-testid="applied-actions">
              {s.running && (
                <div className="flex items-center gap-2 text-xs text-ink-400">
                  <Spinner /> Re-simulating…
                </div>
              )}
              {outcomes.length === 0 && <p className="text-xs text-ink-400">No actions applied — Recovered equals Disrupted.</p>}
              {outcomes.map((o, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-xs">
                  <span className="num mt-0.5 text-ink-500">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink-100">{describeAction(o.action)}</div>
                    <div className="text-ink-400">{o.message}</div>
                    {o.warnings.map((w, k) => (
                      <div key={k} className="text-amber-200/80">
                        ⚠ {w}
                      </div>
                    ))}
                  </div>
                  <Badge tone={o.applied ? 'ok' : 'crit'}>{o.applied ? 'applied' : 'rejected'}</Badge>
                  <Button size="icon" variant="ghost" aria-label="Remove action" onClick={() => void s.removeAction(i)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </CardBody>
          </Card>
          <Suggestions />
        </div>
        <div className="space-y-4">
          <Comparison />
          <Card>
            <CardHeader
              icon={<GitCompare className="h-4 w-4" />}
              title="Compare recovery strategies"
              subtitle="Snapshot the current plan, try alternatives, compare side by side"
            />
            <CardBody className="space-y-3">
              <div className="flex gap-2">
                <Input aria-label="Strategy snapshot name" placeholder={`Strategy ${s.strategies.length + 1}`} value={label} onChange={(e) => setLabel(e.target.value)} />
                <Button
                  variant="outline"
                  onClick={() => {
                    s.saveStrategy(label || `Strategy ${s.strategies.length + 1}`)
                    setLabel('')
                  }}
                  data-testid="save-strategy"
                >
                  <Save className="h-3.5 w-3.5" /> Snapshot
                </Button>
              </div>
              {s.strategies.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-ink-700">
                  <table className="w-full text-xs" data-testid="strategies-table">
                    <caption className="sr-only">Saved Recovery Strategy Alternative Comparison</caption>
                    <thead className="bg-ink-850 text-ink-400">
                      <tr>
                        {['Strategy', 'Actions', 'Delayed', 'Cancelled', 'Delay min', 'Missed conn.', 'Crew viol.', 'Spares', 'Recovery', ''].map((h) => (
                          <th key={h} scope="col" className="px-2 py-1.5 text-left font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.strategies.map((st, i) => {
                        const best = Math.max(...s.strategies.map((x) => x.recoveryPct ?? -Infinity))
                        return (
                          <tr key={i} className={cn('border-t border-ink-800', st.recoveryPct === best && best > 0 && 'bg-recover/5')}>
                            <td className="px-2 py-1.5 font-medium">{st.label}</td>
                            <td className="px-2 py-1.5 text-ink-400" title={st.actions.map(describeAction).join('\n')}>
                              {st.actions.length}
                            </td>
                            <td className="num px-2 py-1.5">{st.kpis.delayed}</td>
                            <td className="num px-2 py-1.5">{st.kpis.cancelled}</td>
                            <td className="num px-2 py-1.5">{n(st.kpis.total_arr_delay_min)}</td>
                            <td className="num px-2 py-1.5">{st.kpis.missed_connections}</td>
                            <td className="num px-2 py-1.5">{st.kpis.crew_violations}</td>
                            <td className="num px-2 py-1.5">{st.kpis.spares_used}</td>
                            <td className="num px-2 py-1.5 text-emerald-300">{st.recoveryPct !== null && st.actions.length ? `${st.recoveryPct}%` : '—'}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" aria-label={`Load strategy ${st.label}`} onClick={() => void s.loadStrategy(i)}>
                                  Load
                                </Button>
                                <Button size="icon" variant="ghost" aria-label={`Delete strategy ${st.label}`} onClick={() => s.removeStrategy(i)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  )
}
