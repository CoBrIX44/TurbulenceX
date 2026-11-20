// Types mirror backend Pydantic models (backend/app/engine/models.py). Times are integer
// minutes from midnight IST; values >= 1440 are the following day.

export type DisruptionType = 'thunderstorm' | 'airport_closure' | 'runway_blockage' | 'airspace_restriction' | 'ground_handling' | 'capacity_reduction'

export interface Airport {
  id: string
  name: string
  city: string
  lat: number
  lng: number
  tier: string
  capacity_per_hour: number
}

export interface NetworkFlight {
  flight_id: string
  tail_id: string
  leg_order: number
  origin: string
  destination: string
  dep: string
  arr: string
  block_minutes: number
  pax: number
  turnaround_before_min: number | null
  dep_min: number
  arr_min: number
}

export interface Connection {
  connection_id: string
  airport: string
  from_flight: string
  to_flight: string
  passengers: number
  min_connect_minutes: number
}

export interface Crew {
  crew_id: string
  tail_id: string
  base: string
  duty_start: string
  max_duty_mins: number
  flight_ids: string[]
}

export interface SpareAircraft {
  tail_id: string
  base: string
  available_from: string
  seats: number
}

export interface NetworkData {
  meta: { dataset: string; operating_day: string; min_turnaround_minutes: number; seats_per_aircraft: number; notes: string[] }
  airports: Airport[]
  flights: NetworkFlight[]
  connections: Connection[]
  crews: Crew[]
  spare_aircraft: SpareAircraft[]
  rotations: Record<string, string[]>
  routes: [string, string][]
  positioning_routes: Record<string, Record<string, number>>
  checksum: string
}

export interface Disruption {
  id: string
  airport: string
  type: DisruptionType
  start: string
  duration_min: number
  capacity_reduction_pct: number
  extra_turnaround_min: number
  description: string
}

export type RecoveryAction =
  | { type: 'cancel_flights'; flight_ids: string[] }
  | { type: 'deploy_spare'; spare_tail: string; replace_tail: string; from_flight: string }
  | { type: 'swap_aircraft'; flight_a: string; flight_b: string }
  | { type: 'protect_connection'; connection_id: string; max_hold_min: number }

export interface SimulationSettings {
  assume_standby_crew_for_spares: boolean
}

export interface ScenarioInput {
  disruptions: Disruption[]
  actions: RecoveryAction[]
  settings: SimulationSettings
}

export type FlightStatus = 'on_time' | 'delayed' | 'severe' | 'cancelled'

export interface DelayComponent {
  kind: string
  minutes: number
  detail: string
  source_flight: string | null
  disruption_id: string | null
}

export interface FlightResult {
  flight_id: string
  tail_id: string
  operating_tail: string | null
  leg_order: number
  origin: string
  destination: string
  pax: number
  block_minutes: number
  sched_dep: number
  sched_arr: number
  actual_dep: number | null
  actual_arr: number | null
  dep_delay: number
  arr_delay: number
  status: FlightStatus
  is_ferry: boolean
  components: DelayComponent[]
  primary_reason: string
  explanation: string
  inherited_delay: number
  introduced_delay: number
  previous_leg: string | null
  next_leg: string | null
  delay_parents: string[]
  root_cause: string | null
  cancel_reason: string | null
  crew_id: string | null
}

export interface ConnectionResult {
  connection_id: string
  airport: string
  from_flight: string
  to_flight: string
  passengers: number
  min_connect_minutes: number
  scheduled_slack: number
  actual_connect_minutes: number | null
  status: 'made' | 'missed' | 'inbound_cancelled' | 'outbound_cancelled'
  protected: boolean
  reason: string
}

export interface CrewResult {
  crew_id: string
  tail_id: string
  is_standby: boolean
  base: string
  duty_start: number
  max_duty_mins: number
  flights: string[]
  scheduled_duty_end: number | null
  actual_duty_end: number | null
  scheduled_duty_mins: number
  actual_duty_mins: number
  violation: boolean
  excess_mins: number
  cause_flight: string | null
  explanation: string
}

export interface CapacityBucket {
  airport: string
  hour: number
  capacity: number
  effective_capacity: number
  scheduled_movements: number
  actual_movements: number
  scheduled_overload: boolean
  restricted: boolean
}

export type EventSeverity = 'info' | 'warning' | 'critical' | 'recovery'

export interface SimEvent {
  event_id: string
  timestamp: number
  kind: string
  flight_id: string | null
  airport: string | null
  aircraft: string | null
  previous_dependency: string | null
  delay_introduced: number
  cumulative_delay: number
  severity: EventSeverity
  message: string
}

export interface AircraftResult {
  tail_id: string
  is_spare: boolean
  base: string | null
  flights: string[]
  total_delay: number
  max_delay: number
  final_location: string | null
  status: 'normal' | 'delayed' | 'disrupted' | 'idle' | 'deployed'
}

export type AirportState = 'normal' | 'disrupted' | 'closed' | 'congested' | 'recovery'

export interface AirportResult {
  airport: string
  departures: number
  arrivals: number
  delayed_flights: number
  cancelled_flights: number
  affected_pax: number
  restricted: boolean
  state: AirportState
}

export interface KPIs {
  total_flights: number
  operated_flights: number
  on_time: number
  delayed: number
  severe: number
  cancelled: number
  total_arr_delay_min: number
  total_dep_delay_min: number
  avg_delay_delayed_min: number
  max_delay_min: number
  pax_scheduled: number
  pax_on_delayed: number
  pax_on_cancelled: number
  missed_connections: number
  missed_connection_pax: number
  distinct_affected_pax_estimate: number
  pax_awaiting_recovery: number
  passenger_delay_minutes: number
  aircraft_delayed: number
  crew_violations: number
  spares_total: number
  spares_used: number
  spares_available: number
  otp_pct: number
  health_score: number
  severity: 'normal' | 'minor' | 'moderate' | 'severe'
  impact_index: number
}

export interface Check {
  check: string
  passed: boolean
  detail: string
}

export interface ActionOutcome {
  index: number
  action: RecoveryAction
  feasible: boolean
  applied: boolean
  checks: Check[]
  warnings: string[]
  message: string
}

export interface SimulationResult {
  flights: FlightResult[]
  connections: ConnectionResult[]
  crews: CrewResult[]
  aircraft: AircraftResult[]
  airports: AirportResult[]
  capacity: CapacityBucket[]
  events: SimEvent[]
  kpis: KPIs
  actions: ActionOutcome[]
  disruptions: Disruption[]
  ferries: FlightResult[]
}

export interface ComparisonRow {
  metric: keyof KPIs
  label: string
  baseline: number
  disrupted: number
  recovered?: number
}

export interface Comparison {
  rows: ComparisonRow[]
  network_recovery_pct: number | null
  delay_minutes_recovery_pct: number | null
}

export interface SimulateResponse {
  baseline: SimulationResult
  disrupted: SimulationResult
  recovered: SimulationResult | null
  comparison: Comparison
}

export interface ImpactDelta {
  delay_minutes_before: number
  delay_minutes_after: number
  delay_reduction_min: number
  impact_before: number
  impact_after: number
  impact_reduction: number
  pax_protected: number
  missed_connection_pax_before: number
  missed_connection_pax_after: number
  cancelled_pax_added: number
  crew_violations_before: number
  crew_violations_after: number
  delayed_flights_before: number
  delayed_flights_after: number
}

export interface EvaluatedAction {
  candidate_id: string
  category: string
  action: RecoveryAction
  feasible: boolean
  feasibility_status: 'feasible' | 'feasible_with_warnings' | 'infeasible'
  checks: Check[]
  warnings: string[]
  message: string
  flights_affected: string[]
  impact: ImpactDelta | null
  trade_offs: string[]
}

export interface Recommendation {
  rank: number
  candidate_id: string
  title: string
  category: string
  action: RecoveryAction
  reason: string
  reason_source: 'llm' | 'rule_based'
  proposed_by: 'llm_selected' | 'llm_proposed' | 'rule_based'
  flights_affected: string[]
  impact: ImpactDelta
  trade_offs: string[]
  risks: string[]
  checks: Check[]
  feasibility_status: string
}

export interface DispatcherResponse {
  source: 'llm' | 'rule_based'
  model: string | null
  provider_error: string | null
  situation_summary: string
  unverified_numbers: string[]
  recommendations: Recommendation[]
  rejected: { proposal: Record<string, unknown>; reason: string }[]
  crew_alerts: { crew_id: string; tail_id: string; excess_mins: number; explanation: string }[]
  priority_flights: { flight_id: string; route: string; arr_delay: number; pax: number; passenger_delay_minutes: number; reason: string }[]
  candidates_evaluated: number
}

export interface StoredScenario {
  id: string
  name: string
  description: string
  disruptions: Disruption[]
  actions: RecoveryAction[]
  settings: SimulationSettings
  created_at: string
  updated_at: string
}

export interface Preset {
  id: string
  name: string
  description: string
  disruptions: Disruption[]
}

export interface ValidationReport {
  valid: boolean
  checksum: string
  counts: Record<string, number>
  expected_counts: Record<string, number>
  checks: { id: string; title: string; passed: boolean; issues: string[] }[]
}

export interface ModelParameters {
  min_turnaround_minutes: number
  seats_per_aircraft: number
  delay_threshold_min: number
  severe_delay_min: number
  crew_report_min: number
  cancelled_pax_penalty_min: number
  missed_connection_pax_penalty_min: number
  health_bands: [number, string][]
  default_reduction_pct: Record<DisruptionType, number>
  llm: { configured: boolean; model: string | null; base_url: string | null }
}
