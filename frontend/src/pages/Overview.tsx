import { AlertTriangle, Bot, CalendarClock, CheckCircle2, Clock3, Link2Off, Plane, PlaneTakeoff, Users, Wrench, XCircle, Zap } from 'lucide-react'
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
  return (
    <Card className="px-4 py-3" data-testid="active-scenario">
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${r.disruptions.length ? 'animate-ping bg-warn' : 'bg-ok'}`} />
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${r.disruptions.length ? 'bg-warn' : 'bg-ok'}`} />
        </span>
        <span className="text-xs uppercase tracking-wider text-ink-400">Active scenario</span>
        <span className="font-semibold text-ink-100">{s.scenario.name}</span>
        <Badge tone="cyan">Showing: {activeLabel(s)}</Badge>
        {r.disruptions.map((d) => (
          <Badge key={d.id} tone="warn">
            {d.airport} {typeLabel(d.type)} {d.start}–{fmt((parseHHMM(d.start) ?? 0) + d.duration_min)}
          </Badge>
        ))}
        {s.scenario.actions.length > 0 && <Badge tone="recover">{s.scenario.actions.length} recovery action(s)</Badge>}
        {r.disruptions.length === 0 && <span className="text-xs text-ink-400">Baseline schedule — no disruptions configured.</span>}
      </div>
    </Card>
  )
}

function QuickStart() {
  const { presets, loadPreset, running } = useSim()
  return (
    <Card className="border-sky-accent/30 bg-gradient-to-r from-sky-accent/10 via-ink-850 to-ink-850">
      <CardBody className="flex flex-wrap items-center gap-4">
        <Zap className="h-6 w-6 text-sky-accent" />
        <div className="min-w-[240px] flex-1">
          <div className="font-semibold">One disruption. A thousand consequences. One intelligent recovery system.</div>
          <div className="text-sm text-ink-300">
            The network below is the real 16-airport, 70-flight schedule running on time. Trigger a disruption to watch delays cascade through aircraft
            rotations, connections and crew duty.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.slice(0, 2).map((p) => (
            <Button key={p.id} variant="primary" disabled={running} onClick={() => void loadPreset(p)} data-testid={`quick-${p.id}`}>
              <AlertTriangle className="h-4 w-4" /> {p.name}
            </Button>
          ))}
          <Link to="/simulations">
            <Button variant="outline">Configure your own</Button>
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
  if (!r.disruptions.length) return <p className="text-xs text-ink-400">Recommendations appear once a disruption is simulated.</p>
  if (!fresh)
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-ink-400">
          Ask the dispatcher to analyse this disruption. Every recommendation is re-simulated by the engine before it is shown.
        </p>
        <Button variant="ai" onClick={() => void s.askDispatcher()} disabled={s.dispatcherLoading} data-testid="overview-ask-ai">
          {s.dispatcherLoading ? <Spinner /> : <Bot className="h-4 w-4" />} Ask AI dispatcher
        </Button>
        {s.dispatcherError && <p className="text-xs text-red-300">{s.dispatcherError}</p>}
      </div>
    )
  const d = s.dispatcher!
  return (
    <div className="space-y-2">
      <Badge tone={d.source === 'llm' ? 'ai' : 'neutral'}>{d.source === 'llm' ? `LLM · ${d.model}` : 'Rule-based engine (no LLM configured)'}</Badge>
      {d.recommendations.length === 0 && <p className="text-xs text-ink-400">No improving action found.</p>}
      {d.recommendations.slice(0, 3).map((rec) => (
        <div key={rec.candidate_id} className="rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-xs">
          <div className="font-medium text-ink-100">
            {rec.rank}. {rec.title}
          </div>
          <div className="num mt-1 text-emerald-300">
            −{rec.impact.delay_reduction_min} delay min · {rec.impact.pax_protected} pax protected (engine)
          </div>
        </div>
      ))}
      <Link to="/dispatcher" className="text-xs text-cyan-300 hover:underline">
        Open AI Dispatcher →
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
    <Page title="Operations Overview" subtitle={`${network.meta.dataset} · single operating day · all times IST`}>
      {r.disruptions.length === 0 && s.view !== 'baseline' && <QuickStart />}
      <ActiveScenario />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="kpis">
        <KpiCard label="Scheduled flights" value={k.total_flights} sub={`${k.operated_flights} operated`} icon={<Plane className="h-4 w-4" />} tone="cyan" />
        <KpiCard
          label="On time"
          value={k.on_time}
          sub={`${k.otp_pct}% OTP (A15)`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="ok"
          delta={{ value: k.on_time - base.on_time, goodWhenNegative: false }}
        />
        <KpiCard
          label="Delayed"
          value={k.delayed}
          sub={`${k.severe} severe · ${n(k.total_arr_delay_min)} delay min`}
          icon={<Clock3 className="h-4 w-4" />}
          tone={k.delayed ? 'warn' : 'neutral'}
        />
        <KpiCard
          label="Cancelled"
          value={k.cancelled}
          sub={`${n(k.pax_on_cancelled)} pax on cancelled`}
          icon={<XCircle className="h-4 w-4" />}
          tone={k.cancelled ? 'crit' : 'neutral'}
        />
        <KpiCard
          label="Affected passengers"
          value={n(k.distinct_affected_pax_estimate)}
          sub="estimate · see Passenger Impact"
          hint="Flight boardings on delayed/cancelled flights, de-duplicated only across listed connections. The dataset has no passenger identities."
          icon={<Users className="h-4 w-4" />}
          tone={k.distinct_affected_pax_estimate ? 'warn' : 'neutral'}
        />
        <KpiCard
          label="Missed connections"
          value={k.missed_connections}
          sub={`${n(k.missed_connection_pax)} connecting pax`}
          icon={<Link2Off className="h-4 w-4" />}
          tone={k.missed_connections ? 'crit' : 'neutral'}
        />
        <KpiCard
          label="Aircraft delayed"
          value={`${k.aircraft_delayed}/16`}
          sub="active fleet"
          icon={<PlaneTakeoff className="h-4 w-4" />}
          tone={k.aircraft_delayed ? 'warn' : 'neutral'}
        />
        <KpiCard
          label="Crew duty violations"
          value={k.crew_violations}
          sub="vs dataset max duty"
          icon={<CalendarClock className="h-4 w-4" />}
          tone={k.crew_violations ? 'crit' : 'neutral'}
        />
        <KpiCard
          label="Spare aircraft"
          value={`${k.spares_available}/${k.spares_total}`}
          sub="VT-DS17 BLR · VT-DS18 DEL"
          icon={<Wrench className="h-4 w-4" />}
          tone={k.spares_used ? 'recover' : 'cyan'}
        />
        <KpiCard
          label="Disruption severity"
          value={<SeverityBadge severity={k.severity} />}
          sub={`max delay ${k.max_delay_min}m`}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={k.severity === 'normal' ? 'ok' : k.severity === 'severe' ? 'crit' : 'warn'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader
            title="India network — live simulation"
            subtitle="Click an airport or route for details; play the day to watch the cascade"
            actions={
              <Link to="/map" className="text-xs text-cyan-300 hover:underline">
                Full map →
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
            <CardHeader title="Network health" subtitle="Health = on-time performance (arrival delay < 15 min)" />
            <CardBody>
              <HealthGauge kpis={k} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Delay distribution" />
            <CardBody>
              <DelayDistribution flights={r.flights} height={170} />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Airport disruption summary" subtitle="Delayed & cancelled movements per airport" />
          <CardBody>
            <AirportImpactChart result={r} height={200} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Aircraft status" subtitle="16 active aircraft + 2 spares" />
          <CardBody>
            <AircraftGrid aircraft={r.aircraft} />
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHeader
            title="Flight delay table"
            subtitle="Delayed and cancelled flights — click a row to trace why"
            actions={
              <Link to="/flights" className="text-xs text-cyan-300 hover:underline">
                All flights →
              </Link>
            }
          />
          <CardBody>
            {delayedFlights.length ? (
              <FlightTable flights={delayedFlights} network={network} compact maxHeight={360} />
            ) : (
              <p className="py-8 text-center text-sm text-ink-400">All 70 flights are on time in this view.</p>
            )}
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="Disruption event timeline" subtitle="Synchronised with playback" />
          <CardBody>
            <EventLog events={r.events} t={s.t} height={360} />
          </CardBody>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title="AI recommendations" icon={<Bot className="h-4 w-4 text-ai" />} />
          <CardBody>
            <RecommendationsPreview />
          </CardBody>
        </Card>
      </div>
    </Page>
  )
}
