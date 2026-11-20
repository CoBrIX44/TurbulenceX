import { parseHHMM } from './time'
import type { Disruption } from './types'

export interface DraftErrors {
  airport?: string
  start?: string
  duration?: string
  severity?: string
}

/** Client-side validation mirroring backend constraints (backend validates again). */
export function validateDisruption(d: Disruption, knownAirports: string[]): DraftErrors {
  const e: DraftErrors = {}
  if (!knownAirports.includes(d.airport)) e.airport = 'Select an airport from the network'
  if (parseHHMM(d.start) === null) e.start = 'Use 24-hour HH:MM (00:00–23:59)'
  if (!Number.isInteger(d.duration_min) || d.duration_min < 5 || d.duration_min > 1440) e.duration = 'Duration must be 5–1440 minutes'
  if (d.type === 'ground_handling') {
    if (d.extra_turnaround_min < 5 || d.extra_turnaround_min > 240) e.severity = 'Extra turnaround must be 5–240 minutes'
  } else if (d.type !== 'airport_closure' && (d.capacity_reduction_pct < 10 || d.capacity_reduction_pct > 100)) {
    e.severity = 'Capacity reduction must be 10–100%'
  }
  return e
}
