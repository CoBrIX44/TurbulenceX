import { describe, expect, it } from 'vitest'
import { delayBuckets, filterFlights, emptyFilter, sortFlights, traceBackward, traceForward } from './filters'
import { aircraftPositions, airportStateAt, bearing, nextEventTime, phaseAt, prevEventTime, recoveryAirportsOf, timelineBounds } from './playback'
import { routeKey, routeStates } from './routes'
import { fmt, fmtDelay, parseHHMM } from './time'
import type { Airport, Disruption, FlightResult, SimEvent, SimulationResult } from './types'
import { validateDisruption } from './validation'

const f = (o: Partial<FlightResult>): FlightResult => ({
  flight_id: 'DS0001',
  tail_id: 'VT-DS01',
  operating_tail: 'VT-DS01',
  leg_order: 1,
  origin: 'DEL',
  destination: 'BOM',
  pax: 100,
  block_minutes: 120,
  sched_dep: 600,
  sched_arr: 720,
  actual_dep: 600,
  actual_arr: 720,
  dep_delay: 0,
  arr_delay: 0,
  status: 'on_time',
  is_ferry: false,
  components: [],
  primary_reason: '',
  explanation: '',
  inherited_delay: 0,
  introduced_delay: 0,
  previous_leg: null,
  next_leg: null,
  delay_parents: [],
  root_cause: null,
  cancel_reason: null,
  crew_id: 'CR01',
  ...o,
})

const airports: Record<string, Airport> = {
  DEL: { id: 'DEL', name: 'D', city: 'Delhi', lat: 28.5, lng: 77.1, tier: 'mega_hub', capacity_per_hour: 40 },
  BOM: { id: 'BOM', name: 'B', city: 'Mumbai', lat: 19.1, lng: 72.9, tier: 'mega_hub', capacity_per_hour: 32 },
}

const dis = (o: Partial<Disruption> = {}): Disruption => ({
  id: 'D1',
  airport: 'BOM',
  type: 'airport_closure',
  start: '08:00',
  duration_min: 90,
  capacity_reduction_pct: 100,
  extra_turnaround_min: 0,
  description: '',
  ...o,
})

describe('time', () => {
  it('formats minutes and next-day times', () => {
    expect(fmt(615)).toBe('10:15')
    expect(fmt(1485)).toBe('00:45 +1')
    expect(fmt(null)).toBe('—')
    expect(fmtDelay(75)).toBe('1h 15m')
  })
  it('parses strict HH:MM', () => {
    expect(parseHHMM('08:00')).toBe(480)
    expect(parseHHMM('24:00')).toBeNull()
    expect(parseHHMM('8:00')).toBeNull()
  })
})

describe('disruption validation', () => {
  const ap = ['BOM', 'DEL']
  it('accepts a valid closure', () => expect(validateDisruption(dis(), ap)).toEqual({}))
  it('rejects invalid time, duration, airport and severity', () => {
    const e = validateDisruption(dis({ airport: 'XXX', start: '25:00', duration_min: 2, type: 'capacity_reduction', capacity_reduction_pct: 0 }), ap)
    expect(Object.keys(e).sort()).toEqual(['airport', 'duration', 'severity', 'start'])
  })
  it('requires extra turnaround for ground handling', () => {
    expect(validateDisruption(dis({ type: 'ground_handling', extra_turnaround_min: 0 }), ap).severity).toBeDefined()
  })
})

describe('flight filters', () => {
  const flights = [
    f({ flight_id: 'A1', status: 'on_time' }),
    f({ flight_id: 'A2', status: 'delayed', arr_delay: 20, origin: 'BOM', destination: 'DEL' }),
    f({ flight_id: 'A3', status: 'severe', arr_delay: 80, tail_id: 'VT-DS02', operating_tail: 'VT-DS02' }),
    f({ flight_id: 'A4', status: 'cancelled', actual_dep: null, actual_arr: null, operating_tail: null }),
  ]
  it('filters by status, aircraft, airport and search', () => {
    expect(filterFlights(flights, { ...emptyFilter, status: 'delayed' }).map((x) => x.flight_id)).toEqual(['A2', 'A3'])
    expect(filterFlights(flights, { ...emptyFilter, status: 'severe' }).map((x) => x.flight_id)).toEqual(['A3'])
    expect(filterFlights(flights, { ...emptyFilter, status: 'cancelled' }).map((x) => x.flight_id)).toEqual(['A4'])
    expect(filterFlights(flights, { ...emptyFilter, aircraft: 'VT-DS02' }).map((x) => x.flight_id)).toEqual(['A3'])
    expect(filterFlights(flights, { ...emptyFilter, query: 'a2' }).map((x) => x.flight_id)).toEqual(['A2'])
  })
  it('sorts by delay descending', () => {
    expect(sortFlights(flights, 'arr_delay', -1)[0].flight_id).toBe('A3')
  })
  it('buckets delays', () => {
    const b = delayBuckets(flights)
    expect(b.find((x) => x.bucket === '0')!.count).toBe(1)
    expect(b.find((x) => x.bucket === 'CNX')!.count).toBe(1)
  })
  it('traces causal chains both ways', () => {
    const chain = [f({ flight_id: 'X1' }), f({ flight_id: 'X2', delay_parents: ['X1'] }), f({ flight_id: 'X3', delay_parents: ['X2'] })]
    const byId = Object.fromEntries(chain.map((x) => [x.flight_id, x]))
    expect(traceBackward(byId, 'X3')).toEqual(['X1', 'X2', 'X3'])
    expect(traceForward(chain, 'X1')).toEqual(['X2', 'X3'])
  })
})

describe('playback derivations', () => {
  const fl = f({ actual_dep: 600, actual_arr: 720 })
  it('derives flight phase from engine times', () => {
    expect(phaseAt(fl, 590)).toBe('scheduled')
    expect(phaseAt(f({ sched_dep: 600, actual_dep: 650, actual_arr: 770 }), 620)).toBe('held')
    expect(phaseAt(fl, 660)).toBe('airborne')
    expect(phaseAt(fl, 720)).toBe('arrived')
    expect(phaseAt(f({ status: 'cancelled', actual_dep: null, actual_arr: null }), 660)).toBe('cancelled')
  })
  const result = {
    flights: [fl],
    ferries: [],
    aircraft: [{ tail_id: 'VT-DS01', is_spare: false, base: null, flights: ['DS0001'], total_delay: 0, max_delay: 0, final_location: 'BOM', status: 'normal' }],
    disruptions: [],
    capacity: [],
    events: [],
    connections: [],
    actions: [],
  } as unknown as SimulationResult
  it('interpolates aircraft position while airborne', () => {
    const [p] = aircraftPositions(result, airports, 660)
    expect(p.airborne).toBe(true)
    expect(p.lat).toBeCloseTo((28.5 + 19.1) / 2, 5)
    const [g] = aircraftPositions(result, airports, 800)
    expect(g.airborne).toBe(false)
    expect(g.location).toBe('BOM')
  })
  it('computes timeline bounds on the hour', () => {
    expect(timelineBounds(result)).toEqual([540, 780])
  })
  it('bearing points south-west from DEL to BOM', () => {
    const b = bearing(airports.DEL, airports.BOM)
    expect(b).toBeGreaterThan(180)
    expect(b).toBeLessThan(270)
  })
  it('derives airport state at time t', () => {
    const d = [dis()]
    expect(airportStateAt('BOM', 500, d, [], new Set())).toBe('closed')
    expect(airportStateAt('BOM', 600, d, [], new Set())).toBe('recovery')
    expect(airportStateAt('BOM', 900, d, [], new Set())).toBe('normal')
    expect(airportStateAt('BOM', 500, [dis({ type: 'capacity_reduction', capacity_reduction_pct: 50 })], [], new Set())).toBe('disrupted')
  })
  it('steps between events', () => {
    const ev = [{ timestamp: 480 }, { timestamp: 570 }, { timestamp: 600 }] as SimEvent[]
    expect(nextEventTime(ev, 500)).toBe(570)
    expect(prevEventTime(ev, 570)).toBe(480)
    expect(nextEventTime(ev, 600)).toBeNull()
  })
  it('collects recovery airports from applied actions', () => {
    const r = {
      ...result,
      actions: [{ index: 0, applied: true, action: { type: 'deploy_spare', spare_tail: 'VT-DS17', replace_tail: 'VT-DS01', from_flight: 'DS0001' } }],
    } as unknown as SimulationResult
    expect([...recoveryAirportsOf(r, { 'VT-DS17': 'BLR' })].sort()).toEqual(['BLR', 'DEL'])
  })
})

describe('routes', () => {
  it('aggregates the worst status per city pair', () => {
    const m = routeStates([f({ origin: 'DEL', destination: 'BOM' }), f({ flight_id: 'X', origin: 'BOM', destination: 'DEL', status: 'severe' })])
    expect(routeKey('DEL', 'BOM')).toBe('BOM-DEL')
    expect(m.get('BOM-DEL')!.state).toBe('severe')
    expect(m.get('BOM-DEL')!.flights).toHaveLength(2)
  })
})
