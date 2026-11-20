import L from 'leaflet'
import { useMemo } from 'react'
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { AIRPORT_STATE_COLOR, STATUS_COLOR } from '@/lib/labels'
import { aircraftPositions, airportStateAt } from '@/lib/playback'
import { routeStates, type RouteState } from '@/lib/routes'
import { fmt } from '@/lib/time'
import type { Airport, AirportState, NetworkData, SimulationResult } from '@/lib/types'

const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined) ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export interface MapFilters {
  routes: 'all' | 'disrupted' | 'none'
  aircraft: boolean
  labels: boolean
}

const ROUTE_STYLE: Record<RouteState, { color: string; weight: number; dash?: string; opacity: number }> = {
  on_time: { color: '#22d3ee', weight: 1.4, opacity: 0.35 },
  delayed: { color: '#f59e0b', weight: 2.4, opacity: 0.85 },
  severe: { color: '#ef4444', weight: 3, opacity: 0.9 },
  cancelled: { color: '#94a3b8', weight: 2, dash: '6 6', opacity: 0.8 },
}

function airportIcon(ap: Airport, state: AirportState, selected: boolean, label: boolean) {
  const color = AIRPORT_STATE_COLOR[state]
  const size = ap.tier === 'mega_hub' ? 16 : ap.tier === 'regional_hub' ? 12 : 9
  const pulse =
    state === 'closed' || state === 'disrupted' || state === 'congested'
      ? `<span style="position:absolute;inset:-8px;border-radius:9999px;border:2px solid ${color};animation:ds-ping 1.6s cubic-bezier(0,0,.2,1) infinite;opacity:.7"></span>`
      : ''
  const ring = selected ? `box-shadow:0 0 0 3px #e6eefb;` : `box-shadow:0 0 12px ${color}88;`
  const cross =
    state === 'closed'
      ? `<svg viewBox="0 0 10 10" style="position:absolute;inset:2px"><path d="M2 2L8 8M8 2L2 8" stroke="#081123" stroke-width="2"/></svg>`
      : ''
  const text = label ? `<span class="ds-airport-label" style="position:absolute;left:${size + 4}px;top:${size / 2 - 7}px">${ap.id}</span>` : ''
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="position:relative;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #081123;${ring}">${pulse}${cross}${text}</div>`,
  })
}

function planeIcon(bearingDeg: number, color: string, ferry: boolean) {
  return L.divIcon({
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    html: `<div class="ds-plane" style="width:22px;height:22px;transform:rotate(${bearingDeg}deg)"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2c.9 0 1.5 1 1.5 2.2V9l7.5 4.5v2L13.5 13v4.6l2.5 1.9V21L12 19.9 8 21v-1.5l2.5-1.9V13L3 15.5v-2L10.5 9V4.2C10.5 3 11.1 2 12 2z" fill="${color}" stroke="#050b16" stroke-width="1" ${ferry ? 'stroke-dasharray="2 1"' : ''}/></svg></div>`,
  })
}

export function NetworkMap({
  network,
  result,
  t,
  filters,
  height = 460,
  selectedAirport,
  onAirportClick,
  onRouteClick,
  recoveryAirports,
}: {
  network: NetworkData
  result: SimulationResult
  t: number
  filters: MapFilters
  height?: number | string
  selectedAirport?: string | null
  onAirportClick?: (id: string) => void
  onRouteClick?: (key: string) => void
  recoveryAirports?: Set<string>
}) {
  const airports = useMemo(() => Object.fromEntries(network.airports.map((a) => [a.id, a])), [network])
  const routes = useMemo(() => routeStates(result.flights), [result])
  const planes = useMemo(() => aircraftPositions(result, airports, t), [result, airports, t])
  const recSet = recoveryAirports ?? new Set<string>()

  return (
    <div
      role="region"
      aria-label="Interactive Indian Flight Network Map"
      style={{ height }}
      className="overflow-hidden rounded-lg border border-ink-700"
      data-testid="network-map"
    >
      <MapContainer
        bounds={L.latLngBounds(network.airports.map((a) => [a.lat, a.lng] as [number, number])).pad(0.08)}
        minZoom={4}
        maxZoom={9}
        zoomSnap={0.25}
        zoomDelta={0.5}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        attributionControl
      >
        <TileLayer
          url={TILE_URL}
          className="dark-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {filters.routes !== 'none' &&
          [...routes.entries()].map(([k, r]) => {
            if (filters.routes === 'disrupted' && r.state === 'on_time') return null
            const [a, b] = k.split('-')
            const st = ROUTE_STYLE[r.state]
            const dirAB = r.flights.filter((f) => f.origin === a).length
            const dirBA = r.flights.length - dirAB
            return (
              <Polyline
                key={k}
                positions={[
                  [airports[a].lat, airports[a].lng],
                  [airports[b].lat, airports[b].lng],
                ]}
                pathOptions={{ color: st.color, weight: st.weight, opacity: st.opacity, dashArray: st.dash }}
                eventHandlers={{ click: () => onRouteClick?.(k) }}
              >
                <Tooltip sticky className="ds-tip">
                  <div className="font-semibold">
                    {a} ⇄ {b}
                  </div>
                  <div>
                    {a}→{b}: {dirAB} · {b}→{a}: {dirBA} flights
                  </div>
                  <div>
                    {r.flights.filter((f) => f.status === 'delayed' || f.status === 'severe').length} delayed ·{' '}
                    {r.flights.filter((f) => f.status === 'cancelled').length} cancelled
                  </div>
                  <div className="text-[10px] opacity-70">Click for flights</div>
                </Tooltip>
              </Polyline>
            )
          })}
        {network.airports.map((ap) => {
          const state = airportStateAt(ap.id, t, result.disruptions, result.capacity, recSet)
          const ar = result.airports.find((x) => x.airport === ap.id)
          return (
            <Marker
              key={`${ap.id}-${state}-${selectedAirport === ap.id}-${filters.labels}`}
              position={[ap.lat, ap.lng]}
              icon={airportIcon(ap, state, selectedAirport === ap.id, filters.labels)}
              eventHandlers={{ click: () => onAirportClick?.(ap.id) }}
              zIndexOffset={1000}
            >
              <Tooltip direction="top" offset={[0, -8]} className="ds-tip">
                <div className="font-semibold">
                  {ap.id} · {ap.city}
                </div>
                <div className="opacity-80">{ap.name}</div>
                <div>
                  State at {fmt(t)}: <b style={{ color: AIRPORT_STATE_COLOR[state] }}>{state}</b>
                </div>
                {ar && (
                  <div>
                    {ar.departures} dep · {ar.arrivals} arr · {ar.delayed_flights} delayed
                  </div>
                )}
              </Tooltip>
            </Marker>
          )
        })}
        {filters.aircraft &&
          planes.map((p) => {
            const f = p.flight
            const color = !p.airborne ? '#93a6c6' : f ? (f.is_ferry ? '#34d399' : STATUS_COLOR[f.status]) : '#93a6c6'
            if (!p.airborne)
              return (
                <CircleMarker key={p.tail} center={[p.lat, p.lng]} radius={0} pathOptions={{ opacity: 0 }}>
                  <Tooltip className="ds-tip">{p.tail} on ground</Tooltip>
                </CircleMarker>
              )
            return (
              <Marker key={p.tail} position={[p.lat, p.lng]} icon={planeIcon(p.bearing, color, !!f?.is_ferry)} zIndexOffset={2000}>
                <Tooltip className="ds-tip">
                  <div className="font-semibold">
                    {p.tail} · {f?.flight_id}
                  </div>
                  {f && (
                    <>
                      <div>
                        {f.origin} → {f.destination}
                      </div>
                      <div>
                        Dep {fmt(f.actual_dep)} · Arr {fmt(f.actual_arr)}
                        {f.arr_delay > 0 ? ` (+${f.arr_delay}m)` : ''}
                      </div>
                    </>
                  )}
                </Tooltip>
              </Marker>
            )
          })}
      </MapContainer>
    </div>
  )
}

export function MapLegend() {
  const items: [string, string][] = [
    ['Normal', AIRPORT_STATE_COLOR.normal],
    ['Disrupted', AIRPORT_STATE_COLOR.disrupted],
    ['Closed', AIRPORT_STATE_COLOR.closed],
    ['Congested', AIRPORT_STATE_COLOR.congested],
    ['Recovery', AIRPORT_STATE_COLOR.recovery],
  ]
  const routes: [string, string, string?][] = [
    ['On time', ROUTE_STYLE.on_time.color],
    ['Delayed', ROUTE_STYLE.delayed.color],
    ['Severely disrupted', ROUTE_STYLE.severe.color],
    ['Cancelled', ROUTE_STYLE.cancelled.color, 'dashed'],
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-400">
      <span className="text-ink-500">Airports:</span>
      {items.map(([l, c]) => (
        <span key={l} className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          {l}
        </span>
      ))}
      <span className="ml-2 text-ink-500">Routes:</span>
      {routes.map(([l, c, d]) => (
        <span key={l} className="flex items-center gap-1">
          <span className="h-0.5 w-4" style={{ background: d ? `repeating-linear-gradient(90deg, ${c} 0 3px, transparent 3px 6px)` : c }} />
          {l}
        </span>
      ))}
    </div>
  )
}
