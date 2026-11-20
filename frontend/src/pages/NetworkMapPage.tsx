import { MapPin, Route as RouteIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Page } from '@/components/layout/AppLayout'
import { MapLegend, NetworkMap, type MapFilters } from '@/components/NetworkMap'
import { routeKey } from '@/lib/routes'
import { PlaybackBar } from '@/components/Playback'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Segmented, Switch } from '@/components/ui/form'
import { Empty } from '@/components/ui/misc'
import { AIRPORT_STATE_COLOR } from '@/lib/labels'
import { airportStateAt, recoveryAirportsOf } from '@/lib/playback'
import { fmt } from '@/lib/time'
import { selectActive, useSim } from '@/store/useSim'

export function NetworkMapPage() {
  const s = useSim()
  const r = selectActive(s)!
  const network = s.network!
  const [filters, setFilters] = useState<MapFilters>({ routes: 'all', aircraft: true, labels: true })
  const [airport, setAirport] = useState<string | null>(null)
  const [route, setRoute] = useState<string | null>(null)
  const recoveryAirports = useMemo(() => recoveryAirportsOf(r, Object.fromEntries(network.spare_aircraft.map((x) => [x.tail_id, x.base]))), [r, network])
  const ap = airport ? network.airports.find((a) => a.id === airport) : null
  const apRes = airport ? r.airports.find((a) => a.airport === airport) : null
  const routeFlights = route ? r.flights.filter((f) => routeKey(f.origin, f.destination) === route).sort((a, b) => a.sched_dep - b.sched_dep) : []
  const apFlights = airport ? r.flights.filter((f) => f.origin === airport || f.destination === airport).sort((a, b) => a.sched_dep - b.sched_dep) : []
  const caps = airport ? r.capacity.filter((c) => c.airport === airport && (c.actual_movements || c.scheduled_movements || c.restricted)) : []

  return (
    <Page
      title="Interactive Network Map"
      subtitle="16 airports placed by dataset coordinates · routes from the 70 scheduled flights · state at the playback time"
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            title="Indian airport network"
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Segmented<MapFilters['routes']>
                  size="sm"
                  value={filters.routes}
                  onChange={(v) => setFilters({ ...filters, routes: v })}
                  options={[
                    { value: 'all', label: 'All routes' },
                    { value: 'disrupted', label: 'Disrupted only' },
                    { value: 'none', label: 'Hide routes' },
                  ]}
                />
                <Switch
                  checked={filters.aircraft}
                  onChange={(v) => setFilters({ ...filters, aircraft: v })}
                  label={<span className="text-xs">Aircraft</span>}
                />
                <Switch checked={filters.labels} onChange={(v) => setFilters({ ...filters, labels: v })} label={<span className="text-xs">Labels</span>} />
              </div>
            }
          />
          <CardBody className="space-y-3">
            <NetworkMap
              network={network}
              result={r}
              t={s.t}
              filters={filters}
              height="min(68vh, 680px)"
              selectedAirport={airport}
              recoveryAirports={recoveryAirports}
              onAirportClick={(id) => {
                setAirport(id)
                setRoute(null)
              }}
              onRouteClick={(k) => {
                setRoute(k)
                setAirport(null)
              }}
            />
            <PlaybackBar />
            <MapLegend />
          </CardBody>
        </Card>

        <Card className="max-h-[calc(100vh-160px)] overflow-y-auto">
          {ap && apRes ? (
            <div data-testid="airport-details">
              <CardHeader icon={<MapPin className="h-4 w-4" />} title={`${ap.id} · ${ap.city}`} subtitle={ap.name} />
              <CardBody className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge tone="cyan">{ap.tier.replace('_', ' ')}</Badge>
                  <Badge tone="neutral">{ap.capacity_per_hour} movements / hour</Badge>
                  {(() => {
                    const st = airportStateAt(ap.id, s.t, r.disruptions, r.capacity, recoveryAirports)
                    return (
                      <Badge style={{ color: AIRPORT_STATE_COLOR[st], borderColor: AIRPORT_STATE_COLOR[st] }}>
                        State at {fmt(s.t)}: {st}
                      </Badge>
                    )
                  })()}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Departures', apRes.departures],
                    ['Arrivals', apRes.arrivals],
                    ['Delayed flights', apRes.delayed_flights],
                    ['Cancelled flights', apRes.cancelled_flights],
                    ['Affected passengers', apRes.affected_pax],
                    ['Coordinates', `${ap.lat.toFixed(2)}, ${ap.lng.toFixed(2)}`],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
                      <div className="text-[10px] uppercase tracking-wider text-ink-500">{k}</div>
                      <div className="num text-ink-100">{v}</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-ink-500">
                  Affected passengers = booked passengers on delayed or cancelled flights touching {ap.id} (flight-level count).
                </p>
                {caps.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Hourly capacity use</div>
                    <div className="space-y-1">
                      {caps.map((c) => (
                        <div key={c.hour} className="flex items-center gap-2 text-[11px]">
                          <span className="num w-10 text-ink-400">{fmt(c.hour * 60)}</span>
                          <span className="relative h-2 flex-1 rounded bg-ink-800">
                            <span
                              className="absolute inset-y-0 left-0 rounded"
                              style={{
                                width: `${Math.min(100, (c.actual_movements / Math.max(1, c.capacity)) * 100)}%`,
                                background: c.restricted ? '#f59e0b' : '#22d3ee',
                              }}
                            />
                          </span>
                          <span className="num w-20 text-right text-ink-300">
                            {c.actual_movements}/{c.effective_capacity}
                            {c.restricted && c.effective_capacity < c.capacity ? ` (of ${c.capacity})` : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Movements</div>
                  <div className="space-y-1">
                    {apFlights.map((f) => (
                      <button
                        key={f.flight_id}
                        onClick={() => s.inspect(f.flight_id)}
                        className="flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-ink-800"
                      >
                        <span className="num w-14 text-cyan-200">{f.flight_id}</span>
                        <span className="num w-20 text-ink-300">{f.origin === ap.id ? `→ ${f.destination}` : `← ${f.origin}`}</span>
                        <span className="num text-ink-400">{fmt(f.origin === ap.id ? (f.actual_dep ?? f.sched_dep) : (f.actual_arr ?? f.sched_arr))}</span>
                        <span className="ml-auto">
                          <StatusBadge status={f.status} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardBody>
            </div>
          ) : route ? (
            <div data-testid="route-details">
              <CardHeader
                icon={<RouteIcon className="h-4 w-4" />}
                title={`Route ${route.replace('-', ' ⇄ ')}`}
                subtitle={`${routeFlights.length} scheduled flight(s)`}
              />
              <CardBody className="space-y-2">
                {routeFlights.map((f) => (
                  <button
                    key={f.flight_id}
                    onClick={() => s.inspect(f.flight_id)}
                    className="block w-full cursor-pointer rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-left text-xs hover:border-ink-500"
                  >
                    <div className="flex items-center gap-2">
                      <span className="num font-semibold text-cyan-200">{f.flight_id}</span>
                      <span className="num">
                        {f.origin} → {f.destination}
                      </span>
                      <span className="num text-ink-400">{f.tail_id}</span>
                      <span className="ml-auto">
                        <StatusBadge status={f.status} />
                      </span>
                    </div>
                    <div className="num mt-1 text-ink-400">
                      Sched {fmt(f.sched_dep)}–{fmt(f.sched_arr)} · Actual {fmt(f.actual_dep)}–{fmt(f.actual_arr)} · {f.pax} pax
                    </div>
                  </button>
                ))}
              </CardBody>
            </div>
          ) : (
            <Empty icon={<MapPin className="h-6 w-6" />} title="Select an airport or a route">
              Click an airport marker for capacity, movements and affected passengers, or click a route line to list its flights. Use the playback bar to move
              through the operating day.
            </Empty>
          )}
        </Card>
      </div>
    </Page>
  )
}
