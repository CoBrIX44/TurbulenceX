import { Info, Link2, Users } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { KpiCard } from '@/components/KpiCard'
import { Page } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Spinner } from '@/components/ui/misc'
import { fmt } from '@/lib/time'
import { cn, n } from '@/lib/utils'
import { activeLabel, selectActive, useSim } from '@/store/useSim'

const CONN_TONE = { made: 'ok', missed: 'crit', inbound_cancelled: 'muted', outbound_cancelled: 'muted' } as const

export function PassengerImpactPage() {
  const s = useSim()
  const r = selectActive(s)
  if (!r) {
    return (
      <Page title="Passenger Impact Center" subtitle="Loading passenger impact data…">
        <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-400">
          <Spinner /> Loading passenger analysis…
        </div>
      </Page>
    )
  }
  const k = r.kpis
  const byId = Object.fromEntries(r.flights.map((f) => [f.flight_id, f]))
  const conns = [...r.connections].sort(
    (a, b) => (a.status === 'made' ? 1 : 0) - (b.status === 'made' ? 1 : 0) || a.connection_id.localeCompare(b.connection_id),
  )
  const chart = [
    { name: 'On on-time flights', v: k.pax_scheduled - k.pax_on_delayed - k.pax_on_cancelled, c: '#22c55e' },
    { name: 'On delayed flights', v: k.pax_on_delayed, c: '#f59e0b' },
    { name: 'On cancelled flights', v: k.pax_on_cancelled, c: '#94a3b8' },
    { name: 'Missed connections', v: k.missed_connection_pax, c: '#ef4444' },
  ]
  return (
    <Page title="Passenger Impact Center" subtitle={`${activeLabel(s)} view · flight-level and connection-level passenger counts from the dataset`}>
      <Card className="border-ai/30 bg-ai/5">
        <CardBody className="flex gap-3 text-xs text-ink-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-ai" />
          <p>
            The dataset provides <b>passenger counts per flight</b> and <b>per connection</b>, not individual passenger identities. Counts below are flight
            boardings unless stated. The “distinct affected” figure is an <b>estimate</b>: it removes double-counting only for the 21 listed connections
            (connecting passengers on two disrupted legs) and adds connecting passengers who missed a connection although neither leg was delayed. No individual
            people are identified.
          </p>
        </CardBody>
      </Card>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" data-testid="pax-kpis">
        <KpiCard label="Passengers scheduled" value={n(k.pax_scheduled)} sub="flight boardings, 70 flights" tone="cyan" />
        <KpiCard label="On delayed flights" value={n(k.pax_on_delayed)} sub="flight-level count" tone={k.pax_on_delayed ? 'warn' : 'neutral'} />
        <KpiCard
          label="Missed connections"
          value={n(k.missed_connection_pax)}
          sub={`${k.missed_connections} connection(s) · connection-level`}
          tone={k.missed_connection_pax ? 'crit' : 'neutral'}
        />
        <KpiCard label="On cancelled flights" value={n(k.pax_on_cancelled)} sub="flight-level count" tone={k.pax_on_cancelled ? 'crit' : 'neutral'} />
        <KpiCard
          label="Distinct affected"
          value={n(k.distinct_affected_pax_estimate)}
          sub="ESTIMATE (see note)"
          tone={k.distinct_affected_pax_estimate ? 'warn' : 'neutral'}
        />
        <KpiCard
          label="Awaiting recovery"
          value={n(k.pax_awaiting_recovery)}
          sub="cancelled + missed-connection pax"
          tone={k.pax_awaiting_recovery ? 'crit' : 'neutral'}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader
            icon={<Link2 className="h-4 w-4" />}
            title="Passenger connections"
            subtitle="All 21 dataset connections: actual connection time vs minimum connect time"
          />
          <CardBody>
            <div className="overflow-x-auto rounded-lg border border-ink-700">
              <table className="w-full min-w-[820px] text-xs" data-testid="connections-table">
                <caption className="sr-only">Passenger Connections and Minimum Connect Time Analysis</caption>
                <thead className="bg-ink-850 text-ink-400">
                  <tr>
                    {['ID', 'Airport', 'Inbound', 'Arrives', 'Outbound', 'Departs', 'Pax', 'Connect / MCT', 'Status', 'Why'].map((h) => (
                      <th key={h} scope="col" className="px-2.5 py-2 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conns.map((c) => {
                    const a = byId[c.from_flight]
                    const b = byId[c.to_flight]
                    return (
                      <tr key={c.connection_id} className={cn('border-t border-ink-800', c.status !== 'made' && 'bg-crit/5')}>
                        <td className="num px-2.5 py-1.5 font-semibold">{c.connection_id}</td>
                        <td className="num px-2.5 py-1.5">{c.airport}</td>
                        <td className="px-2.5 py-1.5">
                          <button
                            type="button"
                            aria-label={`Inspect inbound flight ${c.from_flight}`}
                            className="num cursor-pointer text-cyan-300 hover:underline focus-visible:ring-1 focus-visible:ring-sky-accent focus-visible:outline-none rounded"
                            onClick={() => s.inspect(c.from_flight)}
                          >
                            {c.from_flight}
                          </button>
                        </td>
                        <td className="num px-2.5 py-1.5 text-ink-300">{fmt(a.actual_arr)}</td>
                        <td className="px-2.5 py-1.5">
                          <button
                            type="button"
                            aria-label={`Inspect outbound flight ${c.to_flight}`}
                            className="num cursor-pointer text-cyan-300 hover:underline focus-visible:ring-1 focus-visible:ring-sky-accent focus-visible:outline-none rounded"
                            onClick={() => s.inspect(c.to_flight)}
                          >
                            {c.to_flight}
                          </button>
                        </td>
                        <td className="num px-2.5 py-1.5 text-ink-300">{fmt(b.actual_dep)}</td>
                        <td className="num px-2.5 py-1.5">{c.passengers}</td>
                        <td className={cn('num px-2.5 py-1.5', c.status === 'made' ? 'text-ink-300' : 'text-red-300')}>
                          {c.actual_connect_minutes ?? '-'} / {c.min_connect_minutes}m
                        </td>
                        <td className="px-2.5 py-1.5">
                          <Badge tone={CONN_TONE[c.status]}>{c.status.replace('_', ' ')}</Badge>
                          {c.protected && (
                            <Badge tone="recover" className="ml-1">
                              protected
                            </Badge>
                          )}
                        </td>
                        <td className="max-w-[260px] px-2.5 py-1.5 text-ink-400">{c.reason}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={<Users className="h-4 w-4" />}
              title="Passenger exposure"
              subtitle="Flight boardings by flight status, plus connection-level misses"
            />
            <CardBody>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chart} layout="vertical" margin={{ left: 40, right: 16 }}>
                  <CartesianGrid stroke="#16284a" horizontal={false} />
                  <XAxis type="number" stroke="#37507c" fontSize={11} tick={{ fill: '#93a6c6' }} />
                  <YAxis type="category" dataKey="name" stroke="#37507c" fontSize={11} tick={{ fill: '#93a6c6' }} width={110} />
                  <Tooltip contentStyle={{ background: '#0b172c', border: '1px solid #22375e', borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="v" name="Passengers" radius={[0, 4, 4, 0]}>
                    {chart.map((d) => (
                      <Cell key={d.name} fill={d.c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Most exposed flights" subtitle="Passenger-delay minutes = pax × arrival delay" />
            <CardBody className="space-y-1.5">
              {r.flights
                .filter((f) => f.arr_delay > 0 || f.status === 'cancelled')
                .sort((a, b) => b.pax * b.arr_delay - a.pax * a.arr_delay)
                .slice(0, 8)
                .map((f) => (
                  <button
                    key={f.flight_id}
                    onClick={() => s.inspect(f.flight_id)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-ink-800"
                  >
                    <span className="num w-14 text-cyan-200">{f.flight_id}</span>
                    <span className="num w-20 text-ink-300">
                      {f.origin}→{f.destination}
                    </span>
                    <span className="num text-ink-400">{f.pax} pax</span>
                    <span className="num ml-auto text-amber-300">{f.status === 'cancelled' ? 'cancelled' : `${n(f.pax * f.arr_delay)} pax·min`}</span>
                  </button>
                ))}
              {r.flights.every((f) => f.arr_delay === 0 && f.status !== 'cancelled') && (
                <p className="text-xs text-ink-500">No delayed passengers in this view.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  )
}
