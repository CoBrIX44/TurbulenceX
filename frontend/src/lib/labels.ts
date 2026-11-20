import type { AirportState, DisruptionType, EventSeverity, FlightStatus, RecoveryAction } from './types'

export const DISRUPTION_TYPES: { value: DisruptionType; label: string; model: string }[] = [
  { value: 'thunderstorm', label: 'Thunderstorm', model: 'Capacity reduction (default 100% = closure) for the window.' },
  { value: 'airport_closure', label: 'Airport closure', model: 'No arrivals or departures during the window.' },
  { value: 'runway_blockage', label: 'Runway blockage', model: 'Capacity reduction (default 50%; 100% = no runway).' },
  { value: 'airspace_restriction', label: 'Airspace restriction', model: 'Arrivals restricted (default 100%); departures unaffected.' },
  { value: 'ground_handling', label: 'Ground handling disruption', model: 'Extra minutes added to turnarounds whose inbound arrives in the window.' },
  { value: 'capacity_reduction', label: 'Capacity reduction', model: 'Hourly movement capacity reduced by the given percentage.' },
]

export const typeLabel = (t: DisruptionType) => DISRUPTION_TYPES.find((d) => d.value === t)?.label ?? t

export const STATUS_LABEL: Record<FlightStatus, string> = {
  on_time: 'On time',
  delayed: 'Delayed',
  severe: 'Severe delay',
  cancelled: 'Cancelled',
}

export const STATUS_COLOR: Record<FlightStatus, string> = {
  on_time: '#22c55e',
  delayed: '#f59e0b',
  severe: '#ef4444',
  cancelled: '#94a3b8',
}

export const AIRPORT_STATE_COLOR: Record<AirportState, string> = {
  normal: '#22d3ee',
  disrupted: '#f59e0b',
  closed: '#ef4444',
  congested: '#f97316',
  recovery: '#34d399',
}

export const SEVERITY_COLOR: Record<EventSeverity, string> = {
  info: '#93a6c6',
  warning: '#f59e0b',
  critical: '#ef4444',
  recovery: '#34d399',
}

export const REASON_LABEL: Record<string, string> = {
  departure_restriction: 'Departure restriction',
  arrival_ground_delay: 'Ground delay (destination restricted)',
  airborne_hold: 'Airborne hold',
  rotation: 'Late inbound aircraft',
  ground_handling: 'Ground handling',
  connection_hold: 'Connection hold',
  spare_positioning: 'Spare positioning',
  cancelled: 'Cancelled',
  schedule: 'Schedule',
  '': '-',
}

export function describeAction(a: RecoveryAction): string {
  switch (a.type) {
    case 'cancel_flights':
      return `Cancel ${a.flight_ids.join(' + ')}`
    case 'deploy_spare':
      return `Deploy ${a.spare_tail} → ${a.replace_tail} from ${a.from_flight}`
    case 'swap_aircraft':
      return `Swap aircraft ${a.flight_a} ⇄ ${a.flight_b}`
    case 'protect_connection':
      return `Protect ${a.connection_id} (hold ≤ ${a.max_hold_min}m)`
  }
}

/** Human-readable root cause from the engine's machine id (e.g. "disruption:D1"). */
export function rootLabel(root: string | null, disruptions: { id: string; airport: string; type: string; start: string; duration_min: number }[]): string {
  if (!root) return '-'
  if (root.startsWith('disruption:')) {
    const d = disruptions.find((x) => `disruption:${x.id}` === root)
    if (d) return `${d.airport} ${d.type.replaceAll('_', ' ')} from ${d.start} (${d.duration_min}m)`
  }
  if (root.startsWith('cancellation:')) return `Cancellation of ${root.slice(13)}`
  if (root.startsWith('connection_hold:')) return `Hold for connection ${root.slice(16)}`
  return root.replaceAll('_', ' ')
}
