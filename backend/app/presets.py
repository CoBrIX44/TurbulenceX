"""User-selectable scenario templates (inputs only: results are always computed)."""

from __future__ import annotations

from .engine.models import Disruption, DisruptionType

PRESETS: list[dict] = [
    {
        "id": "bom-thunderstorm-90",
        "name": "Mumbai Thunderstorm (90 minutes)",
        "description": "Thunderstorm closes BOM 08:00–09:30 during the morning bank.",
        "disruptions": [
            Disruption(
                id="D1",
                airport="BOM",
                type=DisruptionType.THUNDERSTORM,
                start="08:00",
                duration_min=90,
                capacity_reduction_pct=100,
                description="Thunderstorm cell over BOM",
            )
        ],
    },
    {
        "id": "blr-closure-60",
        "name": "Bengaluru Airport Closure (60 minutes)",
        "description": "BLR closed 14:00–15:00 at the afternoon peak.",
        "disruptions": [
            Disruption(
                id="D1",
                airport="BLR",
                type=DisruptionType.AIRPORT_CLOSURE,
                start="14:00",
                duration_min=60,
                description="BLR runway inspection closure",
            )
        ],
    },
    {
        "id": "del-capacity-50",
        "name": "Delhi Capacity Reduction (50%)",
        "description": "DEL hourly capacity halved 06:00–18:00 (40 → 20 movements/hour). Shows how much slot headroom the schedule has.",
        "disruptions": [
            Disruption(
                id="D1",
                airport="DEL",
                type=DisruptionType.CAPACITY_REDUCTION,
                start="06:00",
                duration_min=720,
                capacity_reduction_pct=50,
                description="Low-visibility procedures",
            )
        ],
    },
    {
        "id": "hyd-runway",
        "name": "Hyderabad Runway Disruption",
        "description": "Runway blocked at HYD 11:30–13:00 (no movements).",
        "disruptions": [
            Disruption(
                id="D1",
                airport="HYD",
                type=DisruptionType.RUNWAY_BLOCKAGE,
                start="11:30",
                duration_min=90,
                capacity_reduction_pct=100,
                description="Disabled aircraft on runway",
            )
        ],
    },
    {
        "id": "multi-airport",
        "name": "Multiple Airport Disruptions",
        "description": "BOM thunderstorm 08:00–09:30, BLR closure 14:00–15:00 and HYD ground-handling disruption 16:00–18:00 (+30 min turnarounds).",
        "disruptions": [
            Disruption(id="D1", airport="BOM", type=DisruptionType.THUNDERSTORM, start="08:00", duration_min=90, capacity_reduction_pct=100),
            Disruption(id="D2", airport="BLR", type=DisruptionType.AIRPORT_CLOSURE, start="14:00", duration_min=60),
            Disruption(
                id="D3",
                airport="HYD",
                type=DisruptionType.GROUND_HANDLING,
                start="16:00",
                duration_min=120,
                capacity_reduction_pct=0,
                extra_turnaround_min=30,
            ),
        ],
    },
]
