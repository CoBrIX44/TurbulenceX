"""Time utilities.

All engine time is represented as integer minutes from midnight (IST) of the
operating day. Values >= 1440 represent the following calendar day, so a flight
pushed past midnight keeps a monotonic timeline (e.g. 1450 == 00:10 +1 day).
"""

from __future__ import annotations

MINUTES_PER_DAY = 1440


def parse_hhmm(value: str) -> int:
    """Parse 'HH:MM' (24h) into minutes from midnight. Raises ValueError on bad input."""
    if not isinstance(value, str) or len(value) != 5 or value[2] != ":":
        raise ValueError(f"Invalid time '{value}': expected HH:MM")
    hh, mm = value[:2], value[3:]
    if not (hh.isdigit() and mm.isdigit()):
        raise ValueError(f"Invalid time '{value}': expected HH:MM")
    h, m = int(hh), int(mm)
    if h > 23 or m > 59:
        raise ValueError(f"Invalid time '{value}': out of range")
    return h * 60 + m


def fmt_minutes(total: int) -> str:
    """Format minutes from midnight as 'HH:MM', adding '+N' for later days."""
    day, rem = divmod(int(total), MINUTES_PER_DAY)
    text = f"{rem // 60:02d}:{rem % 60:02d}"
    if day > 0:
        text += f" +{day}"
    elif day < 0:
        text += f" {day}"
    return text


def resolve_arrival(dep: int, arr_clock: int) -> int:
    """Return the arrival minute on the same timeline as `dep`.

    A clock arrival earlier than the departure means the flight crosses
    midnight, so one day is added.
    """
    return arr_clock + MINUTES_PER_DAY if arr_clock < dep else arr_clock


def hour_bucket(minute: int) -> int:
    """Clock-hour bucket index used by the airport capacity model."""
    return minute // 60
