import type { FlightResult, FlightStatus } from './types'

const RANK: Record<FlightStatus, number> = { on_time: 0, delayed: 1, severe: 2, cancelled: 3 }

export type RouteState = 'on_time' | 'delayed' | 'severe' | 'cancelled'

export function routeKey(a: string, b: string) {
  return [a, b].sort().join('-')
}

export function routeStates(flights: FlightResult[]): Map<string, { state: RouteState; flights: FlightResult[] }> {
  const m = new Map<string, { state: RouteState; flights: FlightResult[] }>()
  for (const f of flights) {
    const k = routeKey(f.origin, f.destination)
    const cur = m.get(k) ?? { state: 'on_time' as RouteState, flights: [] }
    cur.flights.push(f)
    if (RANK[f.status] > RANK[cur.state]) cur.state = f.status
    m.set(k, cur)
  }
  return m
}
