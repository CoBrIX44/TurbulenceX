import { ArrowDownUp, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { Input, Select } from '@/components/ui/form'
import { emptyFilter, filterFlights, sortFlights, type FlightFilter, type SortKey, type StatusFilter } from '@/lib/filters'
import { REASON_LABEL } from '@/lib/labels'
import { fmt } from '@/lib/time'
import type { FlightResult, NetworkData } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSim } from '@/store/useSim'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All flights' },
  { value: 'on_time', label: 'On time' },
  { value: 'delayed', label: 'Delayed' },
  { value: 'severe', label: 'Severe delays (≥60m)' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function FlightTable({
  flights,
  network,
  initialFilter,
  maxHeight = 560,
  compact = false,
}: {
  flights: FlightResult[]
  network: NetworkData
  initialFilter?: Partial<FlightFilter>
  maxHeight?: number
  compact?: boolean
}) {
  const inspect = useSim((s) => s.inspect)
  const [filter, setFilter] = useState<FlightFilter>({ ...emptyFilter, ...initialFilter })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'sched_dep', dir: 1 })
  const rows = useMemo(() => sortFlights(filterFlights(flights, filter), sort.key, sort.dir), [flights, filter, sort])
  const tails = useMemo(() => [...Object.keys(network.rotations), ...network.spare_aircraft.map((s) => s.tail_id)], [network])

  const th = (label: string, key?: SortKey, cls?: string) => (
    <th className={cn('sticky top-0 z-10 bg-ink-850 px-2.5 py-2 text-left font-medium', cls)}>
      {key ? (
        <button
          className="inline-flex cursor-pointer items-center gap-1 hover:text-ink-100"
          onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}
        >
          {label}
          <ArrowDownUp className={cn('h-3 w-3', sort.key === key ? 'text-sky-accent' : 'opacity-40')} />
        </button>
      ) : (
        label
      )}
    </th>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-500" />
          <Input
            placeholder="Search flight, aircraft, airport"
            value={filter.query}
            onChange={(e) => setFilter({ ...filter, query: e.target.value })}
            className="pl-8"
            aria-label="Search flights"
          />
        </div>
        <Select
          aria-label="Status filter"
          value={filter.status}
          onChange={(e) => setFilter({ ...filter, status: e.target.value as StatusFilter })}
          className="w-48"
          data-testid="status-filter"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Aircraft filter" value={filter.aircraft} onChange={(e) => setFilter({ ...filter, aircraft: e.target.value })} className="w-36">
          <option value="">All aircraft</option>
          {tails.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select aria-label="Airport filter" value={filter.airport} onChange={(e) => setFilter({ ...filter, airport: e.target.value })} className="w-32">
          <option value="">All airports</option>
          {network.airports.map((a) => (
            <option key={a.id} value={a.id}>
              {a.id} · {a.city}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-xs text-ink-400" data-testid="flight-count">
          {rows.length} of {flights.length} flights
        </span>
      </div>
      <div style={{ maxHeight }} className="overflow-auto rounded-lg border border-ink-700">
        <table className="w-full min-w-[980px] text-xs" data-testid="flight-table">
          <thead className="text-ink-400">
            <tr>
              {th('Flight', 'flight_id')}
              {th('Aircraft')}
              {!compact && th('Leg')}
              {th('Route')}
              {th('Sched dep', 'sched_dep')}
              {th('Actual dep')}
              {!compact && th('Sched arr')}
              {th('Actual arr')}
              {th('Delay', 'arr_delay', 'text-right')}
              {th('Pax', 'pax', 'text-right')}
              {th('Status')}
              {th('Primary reason')}
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => (
              <tr
                key={f.flight_id}
                onClick={() => inspect(f.flight_id)}
                className="cursor-pointer border-t border-ink-800 hover:bg-ink-800/60"
                data-testid={`row-${f.flight_id}`}
              >
                <td className="num px-2.5 py-1.5 font-semibold text-cyan-200">{f.flight_id}</td>
                <td className="num px-2.5 py-1.5 text-ink-300">
                  {f.tail_id}
                  {f.operating_tail && f.operating_tail !== f.tail_id && <span className="ml-1 text-emerald-300">→ {f.operating_tail}</span>}
                </td>
                {!compact && <td className="num px-2.5 py-1.5 text-ink-400">{f.leg_order}</td>}
                <td className="num px-2.5 py-1.5">
                  {f.origin} → {f.destination}
                </td>
                <td className="num px-2.5 py-1.5 text-ink-300">{fmt(f.sched_dep)}</td>
                <td className={cn('num px-2.5 py-1.5', f.dep_delay > 0 ? 'text-amber-200' : 'text-ink-300')}>{fmt(f.actual_dep)}</td>
                {!compact && <td className="num px-2.5 py-1.5 text-ink-300">{fmt(f.sched_arr)}</td>}
                <td className={cn('num px-2.5 py-1.5', f.arr_delay > 0 ? 'text-amber-200' : 'text-ink-300')}>{fmt(f.actual_arr)}</td>
                <td
                  className={cn(
                    'num px-2.5 py-1.5 text-right font-medium',
                    f.arr_delay >= 60 ? 'text-red-300' : f.arr_delay >= 15 ? 'text-amber-300' : 'text-ink-300',
                  )}
                >
                  {f.status === 'cancelled' ? '—' : `${Math.max(f.dep_delay, f.arr_delay)}m`}
                </td>
                <td className="num px-2.5 py-1.5 text-right text-ink-300">{f.pax}</td>
                <td className="px-2.5 py-1.5">
                  <StatusBadge status={f.status} />
                </td>
                <td className="max-w-[220px] truncate px-2.5 py-1.5 text-ink-300" title={f.explanation}>
                  {REASON_LABEL[f.primary_reason] ?? f.primary_reason}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 text-center text-ink-500">
                  No flights match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
