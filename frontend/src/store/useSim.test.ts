import { beforeEach, describe, expect, it } from 'vitest'
import { useSim } from './useSim'
import type { Disruption } from '@/lib/types'

describe('useSim store', () => {
  beforeEach(() => {
    useSim.setState({
      t: 360,
      playing: false,
      speed: 10,
      view: 'disrupted',
      scenario: {
        id: null,
        name: 'Test Scenario',
        description: 'Test Description',
        disruptions: [],
        actions: [],
        settings: { assume_standby_crew_for_spares: true },
      },
      strategies: [],
      dirty: false,
    })
  })

  it('updates simulated time and clamps correctly', () => {
    const s = useSim.getState()
    s.setT(540)
    expect(useSim.getState().t).toBe(540)
  })

  it('toggles playback and speed settings', () => {
    const s = useSim.getState()
    s.setPlaying(true)
    expect(useSim.getState().playing).toBe(true)

    s.setSpeed(30)
    expect(useSim.getState().speed).toBe(30)
  })

  it('manages scenario disruptions lifecycle', () => {
    const s = useSim.getState()
    const dis: Disruption = {
      id: 'D1',
      airport: 'BOM',
      type: 'airport_closure',
      start: '08:00',
      duration_min: 90,
      capacity_reduction_pct: 100,
      extra_turnaround_min: 0,
      description: 'Closure',
    }

    s.addDisruption(dis)
    expect(useSim.getState().scenario.disruptions).toHaveLength(1)
    expect(useSim.getState().dirty).toBe(true)

    s.updateDisruption('D1', { ...dis, duration_min: 120 })
    expect(useSim.getState().scenario.disruptions[0].duration_min).toBe(120)

    s.removeDisruption('D1')
    expect(useSim.getState().scenario.disruptions).toHaveLength(0)
  })

  it('saves and clears strategies snapshots', () => {
    const dummyKpis = {
      total_flights: 70,
      operated_flights: 70,
      on_time: 70,
      delayed: 0,
      severe: 0,
      cancelled: 0,
      total_arr_delay_min: 0,
      total_dep_delay_min: 0,
      avg_delay_delayed_min: 0,
      max_delay_min: 0,
      pax_scheduled: 10000,
      pax_on_delayed: 0,
      pax_on_cancelled: 0,
      missed_connections: 0,
      missed_connection_pax: 0,
      distinct_affected_pax_estimate: 0,
      pax_awaiting_recovery: 0,
      passenger_delay_minutes: 0,
      aircraft_delayed: 0,
      crew_violations: 0,
      spares_total: 2,
      spares_used: 0,
      spares_available: 2,
      otp_pct: 100,
      health_score: 100,
      severity: 'normal' as const,
      impact_index: 0,
    }
    const dummySimResult = {
      flights: [],
      ferries: [],
      connections: [],
      crews: [],
      aircraft: [],
      airports: [],
      capacity: [],
      events: [],
      kpis: dummyKpis,
      disruptions: [],
      actions: [],
    }

    useSim.setState({
      result: {
        baseline: dummySimResult,
        disrupted: dummySimResult,
        recovered: null,
        comparison: { network_recovery_pct: 50, delay_minutes_recovery_pct: 50, rows: [] },
      },
    })

    const s = useSim.getState()
    s.saveStrategy('Plan Alpha')
    expect(useSim.getState().strategies).toHaveLength(1)
    expect(useSim.getState().strategies[0].label).toBe('Plan Alpha')

    s.removeStrategy(0)
    expect(useSim.getState().strategies).toHaveLength(0)
  })

  it('switches view state', () => {
    const s = useSim.getState()
    s.setView('baseline')
    expect(useSim.getState().view).toBe('baseline')

    s.setView('recovered')
    expect(useSim.getState().view).toBe('recovered')
  })
})
