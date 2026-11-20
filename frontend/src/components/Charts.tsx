import { Bar, BarChart, CartesianGrid, Cell, Legend, PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { delayBuckets } from '@/lib/filters'
import { STATUS_COLOR } from '@/lib/labels'
import { fmt } from '@/lib/time'
import type { AircraftResult, FlightResult, KPIs, SimulationResult } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSim } from '@/store/useSim'

const tooltipStyle = { background: '#0b172c', border: '1px solid #22375e', borderRadius: 8, fontSize: 12, color: '#e6eefb' }
const axis = { stroke: '#37507c', fontSize: 11, tick: { fill: '#93a6c6' } }

export function DelayDistribution({ flights, height = 200 }: { flights: FlightResult[]; height?: number }) {
  const data = delayBuckets(flights)
  const colors = ['#22c55e', '#4ade80', '#f59e0b', '#fb923c', '#ef4444', '#b91c1c', '#94a3b8']
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#16284a" vertical={false} />
        <XAxis
          dataKey="bucket"
          {...axis}
          interval={0}
          label={{ value: 'delay (min) · CNX = cancelled', position: 'insideBottom', offset: -2, fill: '#6b82a8', fontSize: 10 }}
          height={34}
        />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(34,211,238,0.06)' }} formatter={(v) => [`${v} flights`, 'Count']} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export function AirportImpactChart({ result, height = 220 }: { result: SimulationResult; height?: number }) {
  const data = result.airports
    .map((a) => ({ airport: a.airport, delayed: a.delayed_flights, cancelled: a.cancelled_flights, pax: a.affected_pax }))
    .filter((a) => a.delayed + a.cancelled > 0)
    .sort((a, b) => b.delayed + b.cancelled - (a.delayed + a.cancelled))
  if (!data.length) return <div className="flex h-[120px] items-center justify-center text-xs text-ink-500">No airport has delayed or cancelled movements.</div>
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="#16284a" vertical={false} />
        <XAxis dataKey="airport" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(34,211,238,0.06)' }} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="delayed" name="Delayed movements" stackId="a" fill="#f59e0b" />
        <Bar dataKey="cancelled" name="Cancelled movements" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export function HealthGauge({ kpis }: { kpis: KPIs }) {
  const color = { normal: '#22c55e', minor: '#22d3ee', moderate: '#f59e0b', severe: '#ef4444' }[kpis.severity]
  return (
    <div className="relative h-[170px]" data-testid="health-gauge">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="84%" outerRadius="100%" data={[{ v: kpis.health_score }]} startAngle={210} endAngle={-30}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="v" cornerRadius={8} fill={color} background={{ fill: '#16284a' }} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="num text-3xl font-semibold" style={{ color }}>
          {kpis.health_score.toFixed(1)}
        </div>
        <div className="text-[9px] uppercase tracking-[0.15em] text-ink-400">network health</div>
        <div className="mt-1 text-[11px] font-semibold" style={{ color }}>
          {kpis.severity.toUpperCase()}
        </div>
      </div>
    </div>
  )
}

const AC_COLOR: Record<AircraftResult['status'], string> = {
  normal: 'border-ok/40 text-green-300',
  delayed: 'border-warn/50 text-amber-300',
  disrupted: 'border-crit/50 text-red-300',
  idle: 'border-ink-600 text-ink-400',
  deployed: 'border-recover/60 text-emerald-200',
}

export function AircraftGrid({ aircraft }: { aircraft: AircraftResult[] }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
      {aircraft.map((a) => (
        <div
          key={a.tail_id}
          title={`${a.tail_id}: ${a.status}${a.max_delay ? `, max delay ${a.max_delay}m` : ''}${a.final_location ? `, ends at ${a.final_location}` : ''}`}
          className={cn('rounded-md border bg-ink-900 px-1.5 py-1 text-center', AC_COLOR[a.status])}
        >
          <div className="num text-[10px]">{a.tail_id.replace('VT-', '')}</div>
          <div className="text-[9px] uppercase tracking-wide opacity-80">{a.is_spare ? (a.status === 'deployed' ? 'spare ✓' : 'spare') : a.status}</div>
        </div>
      ))}
    </div>
  )
}

/** Gantt view of every aircraft rotation: scheduled (ghost) vs actual bars, with the playback cursor. */
export function RotationGantt({ result, t }: { result: SimulationResult; t: number }) {
  const inspect = useSim((s) => s.inspect)
  const all = [...result.flights, ...result.ferries]
  const lo = Math.floor((Math.min(...all.map((f) => f.sched_dep)) - 30) / 60) * 60
  const hi = Math.ceil((Math.max(...all.map((f) => f.actual_arr ?? f.sched_arr)) + 30) / 60) * 60
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100
  const hours: number[] = []
  for (let h = lo; h <= hi; h += 120) hours.push(h)
  const rows = result.aircraft.map((a) => ({
    tail: a.tail_id,
    spare: a.is_spare,
    legs: all.filter((f) => (f.operating_tail ?? f.tail_id) === a.tail_id || (f.status === 'cancelled' && f.tail_id === a.tail_id && !a.is_spare)),
  }))
  return (
    <div className="overflow-x-auto" data-testid="rotation-gantt">
      <div className="min-w-[760px]">
        <div className="relative ml-20 h-5 border-b border-ink-700">
          {hours.map((h) => (
            <span key={h} className="num absolute -translate-x-1/2 text-[10px] text-ink-500" style={{ left: `${pct(h)}%` }}>
              {fmt(h)}
            </span>
          ))}
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-20 right-0">
            {hours.map((h) => (
              <span key={h} className="absolute inset-y-0 w-px bg-ink-800" style={{ left: `${pct(h)}%` }} />
            ))}
            {result.disruptions.map((d) => {
              const [hh, mm] = d.start.split(':').map(Number)
              const s = hh * 60 + mm
              return (
                <span
                  key={d.id}
                  className="absolute inset-y-0 bg-crit/10"
                  style={{ left: `${pct(s)}%`, width: `${pct(s + d.duration_min) - pct(s)}%` }}
                  title={`${d.airport} ${d.type}`}
                />
              )
            })}
            <span className="absolute inset-y-0 w-0.5 bg-sky-accent shadow-[0_0_8px_#22d3ee]" style={{ left: `${pct(Math.min(hi, Math.max(lo, t)))}%` }} />
          </div>
          {rows.map((r) => (
            <div key={r.tail} className="flex h-7 items-center border-b border-ink-800/60">
              <span className={cn('num w-20 shrink-0 text-[11px]', r.spare ? 'text-emerald-300' : 'text-ink-300')}>{r.tail}</span>
              <div className="relative h-full flex-1">
                {r.legs.map((l) => (
                  <span
                    key={`s-${l.flight_id}`}
                    className="absolute top-1 h-1.5 rounded-full bg-ink-600/80"
                    style={{ left: `${pct(l.sched_dep)}%`, width: `${pct(l.sched_arr) - pct(l.sched_dep)}%` }}
                  />
                ))}
                {r.legs.map((l) =>
                  l.actual_dep !== null && l.actual_arr !== null ? (
                    <button
                      key={`a-${l.flight_id}`}
                      onClick={() => !l.is_ferry && inspect(l.flight_id)}
                      title={`${l.flight_id} ${l.origin}→${l.destination} ${fmt(l.actual_dep)}–${fmt(l.actual_arr)} (+${l.arr_delay}m)`}
                      className="absolute top-3 flex h-3.5 cursor-pointer items-center overflow-hidden rounded-sm px-1 text-[9px] font-semibold text-ink-950 hover:brightness-125"
                      style={{
                        left: `${pct(l.actual_dep)}%`,
                        width: `${pct(l.actual_arr) - pct(l.actual_dep)}%`,
                        background: l.is_ferry ? '#34d399' : STATUS_COLOR[l.status],
                        opacity: t >= l.actual_dep ? 1 : 0.55,
                      }}
                    >
                      {l.flight_id.replace('FERRY-', '')}
                    </button>
                  ) : (
                    <span
                      key={`c-${l.flight_id}`}
                      title={`${l.flight_id} cancelled`}
                      className="absolute top-3 h-3.5 rounded-sm border border-dashed border-slate-400/70"
                      style={{ left: `${pct(l.sched_dep)}%`, width: `${pct(l.sched_arr) - pct(l.sched_dep)}%` }}
                    />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
