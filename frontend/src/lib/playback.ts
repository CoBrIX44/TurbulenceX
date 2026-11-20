// Pure helpers that derive *display* state at a simulated time t from engine results.
// They never compute operational numbers — only interpolate positions/phases between
// engine-provided actual departure and arrival times.
import type { Airport, AirportState, CapacityBucket, Disruption, FlightResult, SimEvent, SimulationResult } from './types'
import { parseHHMM } from './time'

export type Phase = 'scheduled' | 'held' | 'airborne' | 'arrived' | 'cancelled'

export function phaseAt(f: FlightResult, t: number): Phase {
  if (f.status === 'cancelled' || f.actual_dep === null || f.actual_arr === null) return 'cancelled'
  if (t >= f.actual_arr) return 'arrived'
  if (t >= f.actual_dep) return 'airborne'
  if (t >= f.sched_dep) return 'held'
  return 'scheduled'
}

export function timelineBounds(r?: SimulationResult | null): [number, number] {
  if (!r || !Array.isArray(r.flights)) return [300, 1440]
  const flights = [...r.flights, ...(r.ferries ?? [])]
  if (flights.length === 0) return [300, 1440]
  const starts = flights.map((f) => f.sched_dep).filter((v) => typeof v === 'number' && !Number.isNaN(v))
  const ends = flights.map((f) => f.actual_arr ?? f.sched_arr).filter((v) => typeof v === 'number' && !Number.isNaN(v))
  if (starts.length === 0 || ends.length === 0) return [300, 1440]
  const lo = Math.floor((Math.min(...starts) - 30) / 60) * 60
  const hi = Math.ceil((Math.max(...ends) + 30) / 60) * 60
  return [Number.isFinite(lo) ? lo : 300, Number.isFinite(hi) ? hi : 1440]
}

export interface PlanePosition {
  tail: string
  lat: number
  lng: number
  bearing: number
  airborne: boolean
  flight: FlightResult | null
  location: string | null
}

export function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/** Aircraft positions at time t (linear interpolation between airports while airborne). */
export function aircraftPositions(r: SimulationResult, airports: Record<string, Airport>, t: number): PlanePosition[] {
  const all = [...r.flights, ...r.ferries]
  const byTail = new Map<string, FlightResult[]>()
  for (const f of all) {
    if (!f.operating_tail || f.actual_dep === null) continue
    const list = byTail.get(f.operating_tail) ?? []
    list.push(f)
    byTail.set(f.operating_tail, list)
  }
  const out: PlanePosition[] = []
  for (const a of r.aircraft) {
    const legs = (byTail.get(a.tail_id) ?? []).sort((x, y) => (x.actual_dep ?? 0) - (y.actual_dep ?? 0))
    if (legs.length === 0) {
      const ap = a.base ? airports[a.base] : undefined
      if (ap) out.push({ tail: a.tail_id, lat: ap.lat, lng: ap.lng, bearing: 0, airborne: false, flight: null, location: ap.id })
      continue
    }
    const air = legs.find((f) => phaseAt(f, t) === 'airborne')
    if (air) {
      const o = airports[air.origin]
      const d = airports[air.destination]
      const p = Math.min(1, Math.max(0, (t - (air.actual_dep ?? 0)) / Math.max(1, (air.actual_arr ?? 0) - (air.actual_dep ?? 0))))
      out.push({
        tail: a.tail_id,
        lat: o.lat + (d.lat - o.lat) * p,
        lng: o.lng + (d.lng - o.lng) * p,
        bearing: bearing(o, d),
        airborne: true,
        flight: air,
        location: null,
      })
      continue
    }
    const done = legs.filter((f) => (f.actual_arr ?? Infinity) <= t)
    const loc = done.length ? done[done.length - 1].destination : legs[0].origin
    const ap = airports[loc]
    const nextLeg = legs.find((f) => (f.actual_dep ?? 0) > t) ?? null
    out.push({ tail: a.tail_id, lat: ap.lat, lng: ap.lng, bearing: 0, airborne: false, flight: nextLeg, location: loc })
  }
  return out
}

export function activeWindows(disruptions: Disruption[], airport: string, t: number): Disruption[] {
  return disruptions.filter((d) => {
    const s = parseHHMM(d.start)
    return d.airport === airport && s !== null && t >= s && t < s + d.duration_min
  })
}

/** Airport visual state at time t. */
export function airportStateAt(airport: string, t: number, disruptions: Disruption[], capacity: CapacityBucket[], recoveryAirports: Set<string>): AirportState {
  const act = activeWindows(disruptions, airport, t)
  if (act.some((d) => d.type === 'airport_closure' || (d.type !== 'ground_handling' && d.capacity_reduction_pct >= 100))) return 'closed'
  if (act.length) return 'disrupted'
  const b = capacity.find((c) => c.airport === airport && c.hour === Math.floor(t / 60))
  if (b && b.actual_movements > 0 && b.actual_movements >= b.effective_capacity) return 'congested'
  const ended = disruptions.some((d) => {
    const s = parseHHMM(d.start)
    return d.airport === airport && s !== null && t >= s + d.duration_min && t < s + d.duration_min + 120
  })
  if (ended || recoveryAirports.has(airport)) return 'recovery'
  return 'normal'
}

export function eventsUntil(events: SimEvent[], t: number): SimEvent[] {
  return events.filter((e) => e.timestamp <= t)
}

export function nextEventTime(events: SimEvent[], t: number): number | null {
  const e = events.find((x) => x.timestamp > t)
  return e ? e.timestamp : null
}

export function prevEventTime(events: SimEvent[], t: number): number | null {
  let best: number | null = null
  for (const e of events) if (e.timestamp < t) best = e.timestamp
  return best
}

/** Airports touched by applied recovery actions (for the "recovery in progress" map state). */
export function recoveryAirportsOf(r: SimulationResult, spareBases: Record<string, string>): Set<string> {
  const byId = Object.fromEntries(r.flights.map((f) => [f.flight_id, f]))
  const out = new Set<string>()
  for (const o of r.actions) {
    if (!o.applied) continue
    const a = o.action
    if (a.type === 'deploy_spare') {
      if (spareBases[a.spare_tail]) out.add(spareBases[a.spare_tail])
      if (byId[a.from_flight]) out.add(byId[a.from_flight].origin)
    } else if (a.type === 'swap_aircraft' && byId[a.flight_a]) out.add(byId[a.flight_a].origin)
    else if (a.type === 'protect_connection') {
      const c = r.connections.find((x) => x.connection_id === a.connection_id)
      if (c) out.add(c.airport)
    }
  }
  return out
}

/** Playback speeds in simulated minutes per real second. */
export const SPEEDS = [1, 2, 4, 8, 16, 32]
