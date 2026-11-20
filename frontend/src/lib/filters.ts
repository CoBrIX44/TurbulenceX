import type { FlightResult } from './types'

export type StatusFilter = 'all' | 'on_time' | 'delayed' | 'cancelled' | 'severe'

export interface FlightFilter {
  status: StatusFilter
  aircraft: string
  airport: string
  query: string
}

export const emptyFilter: FlightFilter = { status: 'all', aircraft: '', airport: '', query: '' }

export function filterFlights(flights: FlightResult[], f: FlightFilter): FlightResult[] {
  const q = f.query.trim().toUpperCase()
  return flights.filter((x) => {
    if (f.status === 'on_time' && x.status !== 'on_time') return false
    if (f.status === 'delayed' && x.status !== 'delayed' && x.status !== 'severe') return false
    if (f.status === 'severe' && x.status !== 'severe') return false
    if (f.status === 'cancelled' && x.status !== 'cancelled') return false
    if (f.aircraft && x.tail_id !== f.aircraft && x.operating_tail !== f.aircraft) return false
    if (f.airport && x.origin !== f.airport && x.destination !== f.airport) return false
    if (q && !`${x.flight_id} ${x.tail_id} ${x.origin} ${x.destination} ${x.operating_tail ?? ''}`.toUpperCase().includes(q)) return false
    return true
  })
}

export type SortKey = 'flight_id' | 'sched_dep' | 'arr_delay' | 'pax'

export function sortFlights(flights: FlightResult[], key: SortKey, dir: 1 | -1): FlightResult[] {
  return [...flights].sort((a, b) => {
    const av = a[key]
    const bv = b[key]
    if (av < bv) return -1 * dir
    if (av > bv) return 1 * dir
    return a.flight_id < b.flight_id ? -1 : 1
  })
}

/** Walk delay_parents backwards (causes) — returns ordered chain ending with the flight. */
export function traceBackward(byId: Record<string, FlightResult>, id: string): string[] {
  const chain: string[] = []
  const seen = new Set<string>()
  const visit = (fid: string) => {
    if (seen.has(fid) || !byId[fid]) return
    seen.add(fid)
    for (const p of byId[fid].delay_parents) visit(p)
    chain.push(fid)
  }
  visit(id)
  return chain
}

/** Flights whose delay (transitively) depends on `id`. */
export function traceForward(flights: FlightResult[], id: string): string[] {
  const children = new Map<string, string[]>()
  for (const f of flights) for (const p of f.delay_parents) children.set(p, [...(children.get(p) ?? []), f.flight_id])
  const out: string[] = []
  const queue = [...(children.get(id) ?? [])]
  const seen = new Set<string>()
  while (queue.length) {
    const c = queue.shift()!
    if (seen.has(c)) continue
    seen.add(c)
    out.push(c)
    queue.push(...(children.get(c) ?? []))
  }
  return out
}

export function delayBuckets(flights: FlightResult[]): { bucket: string; count: number }[] {
  const b = [
    { bucket: '0', count: 0 },
    { bucket: '1–14', count: 0 },
    { bucket: '15–29', count: 0 },
    { bucket: '30–59', count: 0 },
    { bucket: '60–119', count: 0 },
    { bucket: '120+', count: 0 },
    { bucket: 'CNX', count: 0 },
  ]
  for (const f of flights) {
    if (f.status === 'cancelled') b[6].count++
    else {
      const d = Math.max(f.dep_delay, f.arr_delay)
      if (d === 0) b[0].count++
      else if (d < 15) b[1].count++
      else if (d < 30) b[2].count++
      else if (d < 60) b[3].count++
      else if (d < 120) b[4].count++
      else b[5].count++
    }
  }
  return b
}
