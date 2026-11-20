# DESIGN_SYSTEM — Domino Sky

## Design philosophy
An airline operations control room, not an admin template: deep navy canvas, luminous data, colour reserved for meaning. High information density with clear hierarchy — every colour encodes state (on time, warning, critical, recovered, AI). Numbers are set in a monospaced, tabular face so columns of times and delays align. Motion is functional: playback, pulsing closed airports, fades for new panels.

## Colour palette (Tailwind v4 `@theme` tokens in `src/index.css`)
| Token | Hex | Use |
|---|---|---|
| ink-950 / 900 / 850 / 800 | #050b16 / #081123 / #0b172c / #0f1d35 | canvas, sidebar, cards, inputs |
| ink-700 / 600 / 500 | #16284a / #22375e / #37507c | borders, dividers, chart grid |
| ink-400 / 300 / 200 / 100 | #6b82a8 / #93a6c6 / #c3d0e6 / #e6eefb | secondary → primary text |
| sky-accent | #22d3ee | primary actions, focus, normal airports, on-time routes |
| electric | #3b82f6 | secondary accent |
| warn (amber) | #f59e0b | delays, disrupted airports, warnings |
| crit (red) | #ef4444 | severe delays, closures, missed connections, crew violations |
| ok (green) | #22c55e | on-time flights, passed checks |
| recover (mint) | #34d399 | recovery actions, spares, ferries, recovery airports |
| ai (violet) | #a78bfa | anything produced by the AI dispatcher |
| congested (orange) | #f97316 | congested airports |
| cancelled (slate) | #94a3b8 | cancelled flights (dashed) |

## Typography
- Sans: Inter → system UI stack. Page title 20px/600; card title 14px/600; body 13–14px; labels 11px uppercase tracking-wider.
- Mono (`.num`): JetBrains Mono → ui-monospace, tabular numerals for times, IDs, KPIs.

## Spacing & layout
4px base grid (Tailwind scale). Cards `rounded-xl`, 16px padding, 16px gaps; page padding 16/24px; max width 1600px. Persistent 240px sidebar ≥ md; horizontal nav below md.

## Components
- **Button** (cva variants): primary (cyan glow), secondary, outline, ghost, danger, ai, recover; sizes sm/md/lg/icon.
- **Card / CardHeader / CardBody**: translucent ink-850 surface, hairline border, icon + title + subtitle + actions slot.
- **KpiCard**: coloured left rule by tone, mono value, sub-label, optional delta.
- **Badge** tones: neutral, cyan, ok, warn, crit, ai, recover, muted.
- **Form**: Input, Select, Textarea, Field (label/hint/error), Switch, Segmented control.
- **Drawer** (flight inspector, Esc to close), **Modal**, **Tip** tooltip, **Empty** state, **Spinner**, **Toast**.
- Domain: NetworkMap, PlaybackBar, EventLog, FlightTable, FlightInspector (React Flow graph), RotationGantt, ActionCard, ImpactGrid, ChecksList.

## Tables
Sticky header on ink-850, 12px text, mono numerics right-aligned, row hover ink-800, delayed values amber/red, whole row clickable where it opens a detail. Horizontal scroll inside the card on narrow screens.

## Charts
Recharts on transparent backgrounds; grid #16284a; axis text ink-300 11px; status colours as above; tooltip on ink-850 with border. Health = radial gauge coloured by severity band.

## Map styling
OpenStreetMap tiles inverted and hue-rotated into navy (`.dark-tiles`). Airports: circle sized by tier (mega hub 16px, regional 12px, spoke 9px), fill by state, glow; closed = red with ✕ and pulsing ring; disrupted/congested pulse. Routes: on-time thin translucent cyan, delayed amber 2.4px, severe red 3px, cancelled dashed slate. Aircraft: rotated plane glyph coloured by flight status (mint for ferries). Tooltips styled `.ds-tip`.

## Responsive behaviour
- ≥1280px: multi-column dashboards (KPI 5-up, map + side panels).
- 768–1279px: stacked two-column cards, sidebar visible.
- <768px: sidebar → scrollable top nav, single column, tables scroll horizontally.

## Interaction states
Hover: border/background lift; focus-visible: 2px cyan ring; active: 0.98 scale; disabled: 45% opacity and no pointer events; loading: spinner + disabled button; stale inputs: pulsing Run button + amber notice; selected nav: cyan inset bar; applied action buttons switch to “Applied”.
