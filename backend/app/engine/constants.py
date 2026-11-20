"""Engine constants and explicitly documented model parameters.

Values marked DATASET come from flight_network.json. Values marked MODEL are
documented assumptions (see SCOPE.md §Assumptions) — they are policy weights or
thresholds, never substitutes for dataset facts.
"""

from __future__ import annotations

from typing import Literal

# MODEL: industry-standard D15/A15 punctuality threshold.
DELAY_THRESHOLD_MIN = 15
# MODEL: a delay of an hour or more is classified as severe.
SEVERE_DELAY_MIN = 60

# MODEL: crew report time before first departure. Derived from the dataset —
# every crew's duty_start is exactly 45 minutes before its first departure.
CREW_REPORT_MIN = 45

# MODEL: weights for the passenger impact index used by "network recovery %".
# Passenger-delay minutes are counted directly; each cancelled or missed-
# connection passenger is charged a fixed equivalent so that cancelling flights
# is never free.
CANCELLED_PAX_PENALTY_MIN = 240
MISSED_CONNECTION_PAX_PENALTY_MIN = 180

# MODEL: health score bands (health == on-time performance %).
HEALTH_BANDS: list[tuple[float, Literal["normal", "minor", "moderate"]]] = [(95.0, "normal"), (85.0, "minor"), (70.0, "moderate")]

# Default capacity reduction per disruption type when the user does not override.
DEFAULT_REDUCTION_PCT = {
    "airport_closure": 100,
    "thunderstorm": 100,
    "runway_blockage": 50,
    "airspace_restriction": 100,
    "ground_handling": 0,
    "capacity_reduction": 50,
}

# Safety bound on slot search iterations (prevents infinite loops on bad input).
MAX_SLOT_ITERATIONS = 500
