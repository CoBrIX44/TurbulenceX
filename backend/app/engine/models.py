"""Pydantic models for the dataset, scenarios and simulation results.

Dataset models mirror flight_network.json exactly; identifiers are preserved.
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .timeutil import parse_hhmm

# --------------------------------------------------------------------------
# Dataset (authoritative source: flight_network.json)
# --------------------------------------------------------------------------


class Meta(BaseModel):
    model_config = ConfigDict(extra="allow")
    dataset: str
    operating_day: str
    min_turnaround_minutes: int
    seats_per_aircraft: int
    notes: list[str] = []


class Airport(BaseModel):
    id: str
    name: str
    city: str
    lat: float
    lng: float
    tier: str
    capacity_per_hour: int


class Flight(BaseModel):
    flight_id: str
    tail_id: str
    leg_order: int
    origin: str
    destination: str
    dep: str
    arr: str
    block_minutes: int
    pax: int
    turnaround_before_min: Optional[int] = None


class Connection(BaseModel):
    connection_id: str
    airport: str
    from_flight: str
    to_flight: str
    passengers: int
    min_connect_minutes: int


class Crew(BaseModel):
    crew_id: str
    tail_id: str
    base: str
    duty_start: str
    max_duty_mins: int
    flight_ids: list[str]


class SpareAircraft(BaseModel):
    tail_id: str
    base: str
    available_from: str
    seats: int


class Dataset(BaseModel):
    meta: Meta
    airports: list[Airport]
    flights: list[Flight]
    connections: list[Connection]
    crews: list[Crew]
    spare_aircraft: list[SpareAircraft]


# --------------------------------------------------------------------------
# Scenario inputs
# --------------------------------------------------------------------------


class DisruptionType(str, Enum):
    THUNDERSTORM = "thunderstorm"
    AIRPORT_CLOSURE = "airport_closure"
    RUNWAY_BLOCKAGE = "runway_blockage"
    AIRSPACE_RESTRICTION = "airspace_restriction"
    GROUND_HANDLING = "ground_handling"
    CAPACITY_REDUCTION = "capacity_reduction"


class Disruption(BaseModel):
    """A time-boxed restriction at one airport.

    Model (see ARCHITECTURE.md §Simulation engine):
    * capacity_reduction_pct reduces the airport's hourly movement capacity
      inside the window; 100 means fully closed.
    * airspace_restriction applies to arrivals only.
    * ground_handling does not reduce capacity; it adds extra_turnaround_min
      to turnarounds whose inbound arrival falls inside the window.
    """

    id: str = Field(min_length=1, max_length=40)
    airport: str
    type: DisruptionType
    start: str
    duration_min: int = Field(ge=5, le=1440)
    capacity_reduction_pct: int = Field(default=100, ge=0, le=100)
    extra_turnaround_min: int = Field(default=0, ge=0, le=240)
    description: str = ""

    @field_validator("start")
    @classmethod
    def _valid_start(cls, v: str) -> str:
        parse_hhmm(v)
        return v


class CancelFlights(BaseModel):
    type: Literal["cancel_flights"] = "cancel_flights"
    flight_ids: list[str] = Field(min_length=1)


class DeploySpare(BaseModel):
    type: Literal["deploy_spare"] = "deploy_spare"
    spare_tail: str
    replace_tail: str
    from_flight: str


class SwapAircraft(BaseModel):
    """Exchange the remaining rotations of two aircraft at a common airport.

    flight_a and flight_b are the first legs to be exchanged; both must depart
    from the same airport. Crews stay with their aircraft.
    """

    type: Literal["swap_aircraft"] = "swap_aircraft"
    flight_a: str
    flight_b: str


class ProtectConnection(BaseModel):
    type: Literal["protect_connection"] = "protect_connection"
    connection_id: str
    max_hold_min: int = Field(default=60, ge=0, le=240)


RecoveryAction = Annotated[
    Union[CancelFlights, DeploySpare, SwapAircraft, ProtectConnection],
    Field(discriminator="type"),
]


class SimulationSettings(BaseModel):
    """Explicit modelling assumptions that are not in the dataset."""

    assume_standby_crew_for_spares: bool = True


class ScenarioInput(BaseModel):
    disruptions: list[Disruption] = []
    actions: list[RecoveryAction] = []
    settings: SimulationSettings = SimulationSettings()


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------


class FlightStatus(str, Enum):
    ON_TIME = "on_time"
    DELAYED = "delayed"
    SEVERE = "severe"
    CANCELLED = "cancelled"


class DelayComponent(BaseModel):
    kind: str  # rotation | departure_restriction | arrival_ground_delay | airborne_hold | connection_hold | ground_handling
    minutes: int
    detail: str
    source_flight: Optional[str] = None
    disruption_id: Optional[str] = None


class FlightResult(BaseModel):
    flight_id: str
    tail_id: str  # scheduled aircraft from the dataset
    operating_tail: Optional[str]  # aircraft that actually operated (None if cancelled)
    leg_order: int
    origin: str
    destination: str
    pax: int
    block_minutes: int
    sched_dep: int
    sched_arr: int
    actual_dep: Optional[int]
    actual_arr: Optional[int]
    dep_delay: int
    arr_delay: int
    status: FlightStatus
    is_ferry: bool = False
    components: list[DelayComponent] = []
    primary_reason: str = ""
    explanation: str = ""
    inherited_delay: int = 0
    introduced_delay: int = 0
    previous_leg: Optional[str] = None
    next_leg: Optional[str] = None
    delay_parents: list[str] = []
    root_cause: Optional[str] = None
    cancel_reason: Optional[str] = None
    crew_id: Optional[str] = None


class ConnectionResult(BaseModel):
    connection_id: str
    airport: str
    from_flight: str
    to_flight: str
    passengers: int
    min_connect_minutes: int
    scheduled_slack: int
    actual_connect_minutes: Optional[int]
    status: Literal["made", "missed", "inbound_cancelled", "outbound_cancelled"]
    protected: bool = False
    reason: str


class CrewResult(BaseModel):
    crew_id: str
    tail_id: str
    is_standby: bool = False
    base: str
    duty_start: int
    max_duty_mins: int
    flights: list[str]
    scheduled_duty_end: Optional[int]
    actual_duty_end: Optional[int]
    scheduled_duty_mins: int
    actual_duty_mins: int
    violation: bool
    excess_mins: int
    cause_flight: Optional[str] = None
    explanation: str = ""


class CapacityBucket(BaseModel):
    airport: str
    hour: int
    capacity: int
    effective_capacity: int
    scheduled_movements: int
    actual_movements: int
    scheduled_overload: bool
    restricted: bool


class SimEvent(BaseModel):
    event_id: str
    timestamp: int
    kind: str
    flight_id: Optional[str] = None
    airport: Optional[str] = None
    aircraft: Optional[str] = None
    previous_dependency: Optional[str] = None
    delay_introduced: int = 0
    cumulative_delay: int = 0
    severity: Literal["info", "warning", "critical", "recovery"] = "info"
    message: str


class AircraftResult(BaseModel):
    tail_id: str
    is_spare: bool
    base: Optional[str] = None
    flights: list[str]
    total_delay: int
    max_delay: int
    final_location: Optional[str]
    status: Literal["normal", "delayed", "disrupted", "idle", "deployed"]


class AirportResult(BaseModel):
    airport: str
    departures: int
    arrivals: int
    delayed_flights: int
    cancelled_flights: int
    affected_pax: int
    restricted: bool
    state: Literal["normal", "disrupted", "closed", "congested", "recovery"]


class KPIs(BaseModel):
    total_flights: int
    operated_flights: int
    on_time: int
    delayed: int
    severe: int
    cancelled: int
    total_arr_delay_min: int
    total_dep_delay_min: int
    avg_delay_delayed_min: float
    max_delay_min: int
    pax_scheduled: int
    pax_on_delayed: int
    pax_on_cancelled: int
    missed_connections: int
    missed_connection_pax: int
    distinct_affected_pax_estimate: int
    pax_awaiting_recovery: int
    passenger_delay_minutes: int
    aircraft_delayed: int
    crew_violations: int
    spares_total: int
    spares_used: int
    spares_available: int
    otp_pct: float
    health_score: float
    severity: Literal["normal", "minor", "moderate", "severe"]
    impact_index: int


class ActionOutcome(BaseModel):
    index: int
    action: dict
    feasible: bool
    applied: bool
    checks: list[dict]
    warnings: list[str] = []
    message: str


class SimulationResult(BaseModel):
    flights: list[FlightResult]
    connections: list[ConnectionResult]
    crews: list[CrewResult]
    aircraft: list[AircraftResult]
    airports: list[AirportResult]
    capacity: list[CapacityBucket]
    events: list[SimEvent]
    kpis: KPIs
    actions: list[ActionOutcome] = []
    disruptions: list[Disruption] = []
    ferries: list[FlightResult] = []
