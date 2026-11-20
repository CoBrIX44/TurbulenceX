import {
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Link2Off,
  Plane,
  PlaneTakeoff,
  Users,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AircraftGrid, AirportImpactChart, DelayDistribution, HealthGauge } from '@/components/Charts'
import { EventLog } from '@/components/EventLog'
import { FlightTable } from '@/components/FlightTable'
import { KpiCard } from '@/components/KpiCard'
import { Page } from '@/components/layout/AppLayout'
import { MapLegend, NetworkMap, type MapFilters } from '@/components/NetworkMap'
import { PlaybackBar } from '@/components/Playback'
import { SeverityBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/misc'
import { typeLabel } from '@/lib/labels'
import { recoveryAirportsOf } from '@/lib/playback'
import { fmt, parseHHMM } from '@/lib/time'
import { n } from '@/lib/utils'
import { activeLabel, scenarioKey, selectActive, useSim } from '@/store/useSim'

function ActiveScenario() {
  const s = useSim()
  const r = selectActive(s)!
  const hasDisruptions = r.disruptions.length > 0

  return (
    <Card className="px-4 py-3" data-testid="active-scenario">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`h-2.5 w-2.5 rounded-full shrink-0 ${hasDisruptions ? 'bg-warn' : 'bg-ok'}`}
          aria-hidden="true"
        />
        <span className="text-xs uppercase font-semibold tracking-wider text-ink-400">Active scenario:</span>
        <span className="font-semibold text-ink-100">{s.scenario.name}</span>
        <Badge tone="cyan">Showing: {activeLabel(s)}</Badge>
        {r.disruptions.map((d) => (
          <Badge key={d.id} tone="warn">
            {d.airport} {typeLabel(d.type)} {d.start}–{fmt((parseHHMM(d.start) ?? 0) + d.duration_min)}
          </Badge>
        ))}
        {s.scenario.actions.length > 0 && (
          <Badge tone="recover">{s.scenario.actions.length} recovery action(s)</Badge>
        )}
        {!hasDisruptions && (
          <span className="text-xs text-ink-400">Baseline schedule — fully operational, no disruptions active.</span>
        )}
      </div>
    </Card>
  )
}

function QuickStart() {
  const { presets, loadPreset, running } = useSim()
  return (
    <Card className="border border-sky-accent/40 bg-ink-900">
      <CardBody className="flex flex-wrap items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-accent/15 border border-sky-accent/30 text-sky-accent">
          <Zap className="h-5 w-5" />
        </div>
        <div className="min-w-[240px] flex-1">
          <div className="font-semibold text-ink-100">Disruption Cascade &amp; Recovery Testbed</div>
          <div className="text-xs text-ink-300">
            Real 16-airport Indian network with 70 scheduled flights. Select a disruption template below to observe how delays propagate through aircraft rotations and connection banks.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.slice(0, 2).map((p) => (
            <Button
              key={p.id}
              variant="primary"
              disabled={running}
              onClick={() => void loadPreset(p)}
              data-testid={`quick-${p.id}`}
            >
              <AlertTriangle className="h-4 w-4" /> {p.name}
            </Button>
          ))}
          <Link to="/simulations">
            <Button variant="outline">Custom Disruption</Button>
          </Link>
        </div>
      </CardBody>
    </Card>
  )
}

function RecommendationsPreview() {
  const s = useSim()
  const fresh = s.dispatcher && s.dispatcherKey === scenarioKey(s.scenario)
  const r = selectActive(s)!

  if (!r.disruptions.length) {
    return <p className="text-xs text-ink-400">Automated recommendations activate once a disruption is simulated.</p>
  }

  if (!fresh) {
    return (
      <div className="flex flex-col items-start gap-2.5">
        <p className="text-xs text-ink-400 leading-relaxed">
          Request automated recovery analysis. Every candidate action is deterministically validated by the simulation engine before presentation.
        </p>
        <Button
          variant="ai"
          onClick={() => void s.askDispatcher()}
          disabled={s.dispatcherLoading}
          data-testid="overview-ask-ai"
        >
          {s.dispatcherLoading ? <Spinner /> : <Bot className="h-4 w-4" />} Request Recommendations
        </Button>
        {s.dispatcherError && <p className="text-xs text-red-300">{s.dispatcherError}</p>}
      </div>
    )
  }

  const d = s.dispatcher!
  return (
    <div className="space-y-3">
      <Badge tone={d.source === 'llm' ? 'ai' : 'neutral'}>
        {d.source === 'llm' ? `LLM Provider · ${d.model}` : 'Rule-Based Engine (Deterministic)'}
      </Badge>
      {d.recommendations.length === 0 && <p className="text-xs text-ink-400">No improving action found.</p>}
      {d.recommendations.slice(0, 3).map((rec) => (
        <div key={rec.candidate_id} className="rounded-lg border border-ink-700 bg-ink-850 p-3 text-xs">
          <div className="font-semibold text-ink-100">
            {rec.rank}. {rec.title}
          </div>
          <div className="num mt-1 font-medium text-emerald-300">
            −{rec.impact.delay_reduction_min} delay min · {rec.impact.pax_protected} pax protected
          </div>
        </div>
      ))}
      <Link to="/dispatcher" className="inline-flex items-center text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:underline">
        View all recommendations
      </Link>
    </div>
  )
}

export function OverviewPage() {
  const s = useSim()
  const r = selectActive(s)!
  const k = r.kpis
  const base = s.result!.baseline.kpis
  const network = s.network!
  const [filters] = useState<MapFilters>({ routes: 'all', aircraft: true, labels: true })
  const delayedFlights = r.flights.filter((f) => f.status !== 'on_time')
  const recoveryAirports = recoveryAirportsOf(r, Object.fromEntries(network.spare_aircraft.map((x) => [x.tail_id, x.base])))

  return (
    <Page title="Operations Control Overview" subtitle={`${network.meta.dataset} · Single operating day · All timestamps in IST`}>
      {r.disruptions.length === 0 && s.view !== 'baseline' && <QuickStart />}
      <ActiveScenario />

      <div className="space-y-3" data-testid="kpis">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Operational Key Performance Indicators</h2>
          <span className="text-[11px] text-ink-400">Deterministic Engine Metrics</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            label="Scheduled flights"
            value={k.total_flights}
            sub={`${k.operated_flights} operated`}
            icon={<Plane className="h-4 w-4" />}
            tone="cyan"
          />
          <KpiCard
            label="On Time (A15)"
            value={k.on_time}
            sub={`${k.otp_pct}% OTP`}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="ok"
            delta={{ value: k.on_time - base.on_time, goodWhenNegative: false }}
          />
          <KpiCard
            label="Delayed Flights"
            value={k.delayed}
            sub={`${k.severe} severe · ${n(k.total_arr_delay_min)}m total`}
            icon={<Clock3 className="h-4 w-4" />}
            tone={k.delayed ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Cancelled Flights"
            value={k.cancelled}
            sub={`${n(k.pax_on_cancelled)} cancelled pax`}
            icon={<XCircle className="h-4 w-4" />}
            tone={k.cancelled ? 'crit' : 'neutral'}
          />
          <KpiCard
            label="Affected Passengers"
            value={n(k.distinct_affected_pax_estimate)}
            sub="deduplicated estimate"
            hint="Flight boardings on delayed/cancelled flights, de-duplicated across listed connections. Dataset has no personal identifiers."
            icon={<Users className="h-4 w-4" />}
            tone={k.distinct_affected_pax_estimate ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Missed Connections"
            value={k.missed_connections}
            sub={`${n(k.missed_connection_pax)} connecting pax`}
            icon={<Link2Off className="h-4 w-4" />}
            tone={k.missed_connections ? 'crit' : 'neutral'}
          />
          <KpiCard
            label="Aircraft Delayed"
            value={`${k.aircraft_delayed}/16`}
            sub="active fleet"
            icon={<PlaneTakeoff className="h-4 w-4" />}
            tone={k.aircraft_delayed ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Crew Violations"
            value={k.crew_violations}
            sub="exceeding max duty"
            icon={<CalendarClock className="h-4 w-4" />}
            tone={k.crew_violations ? 'crit' : 'neutral'}
          />
          <KpiCard
            label="Spare Aircraft"
            value={`${k.spares_available}/${k.spares_total}`}
            sub="VT-DS17 BLR · VT-DS18 DEL"
            icon={<Wrench className="h-4 w-4" />}
            tone={k.spares_used ? 'recover' : 'cyan'}
          />
          <KpiCard
            label="Network Severity"
            value={<SeverityBadge severity={k.severity} />}
            sub={`max delay ${k.max_delay_min}m`}
            icon={<AlertTriangle className="h-4 w-4" />}
            tone={k.severity === 'normal' ? 'ok' : k.severity === 'severe' ? 'crit' : 'warn'}
          />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="Indian Air Network — Real-Time Spatial Simulation"
            subtitle="Airport nodes and routes for 70 scheduled flights. Scrub timeline below to observe cascade propagation."
            actions={
              <Link to="/map" className="text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:underline">
                Full Network Map
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <NetworkMap network={network} result={r} t={s.t} filters={filters} height={430} recoveryAirports={recoveryAirports} />
            <PlaybackBar compact />
            <MapLegend />
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Network Health Index" subtitle="Health = arrival punctuality (delay < 15 min)" />
            <CardBody>
              <HealthGauge kpis={k} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Arrival Delay Distribution" />
            <CardBody>
              <DelayDistribution flights={r.flights} height={170} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Airport Movement Impact" subtitle="Delayed and cancelled departures/arrivals per airport" />
          <CardBody>
            <AirportImpactChart result={r} height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Aircraft Fleet Status" subtitle="16 operational aircraft + 2 standby spares" />
          <CardBody>
            <AircraftGrid aircraft={r.aircraft} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHeader
            title="Disrupted Flight Roster"
            subtitle="Delayed and cancelled flights — click row to inspect root-cause chain"
            actions={
              <Link to="/flights" className="text-xs font-medium text-cyan-300 hover:text-cyan-200 hover:underline">
                View all 70 flights
              </Link>
            }
          />
          <CardBody>
            {delayedFlights.length ? (
              <FlightTable flights={delayedFlights} network={network} compact maxHeight={360} />
            ) : (
              <div className="py-12 text-center text-sm text-ink-400">
                All 70 flights are on schedule in this scenario view.
              </div>
            )}
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Disruption Event Stream" subtitle="Chronological simulation event log" />
          <CardBody>
            <EventLog events={r.events} t={s.t} height={360} />
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Decision Support" icon={<Bot className="h-4 w-4 text-ai" />} />
          <CardBody>
            <RecommendationsPreview />
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}
