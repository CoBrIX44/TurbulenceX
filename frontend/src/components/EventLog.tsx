import { useEffect, useMemo, useRef, useState } from 'react'
import { Segmented } from '@/components/ui/form'
import { SEVERITY_COLOR } from '@/lib/labels'
import { fmt } from '@/lib/time'
import type { SimEvent } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSim } from '@/store/useSim'

type Mode = 'impact' | 'all'

const MOVEMENT = new Set(['DEPARTED', 'ARRIVED', 'FERRY_DEPARTED', 'FERRY_ARRIVED'])

export function EventLog({ events, t, height = 360, syncToPlayback = true }: { events: SimEvent[]; t: number; height?: number; syncToPlayback?: boolean }) {
  const [mode, setMode] = useState<Mode>('impact')
  const inspect = useSim((s) => s.inspect)
  const setT = useSim((s) => s.setT)
  const list = useMemo(() => {
    let l = mode === 'impact' ? events.filter((e) => !MOVEMENT.has(e.kind) || e.severity !== 'info') : events
    if (syncToPlayback) l = l.filter((e) => e.timestamp <= t)
    return l
  }, [events, mode, t, syncToPlayback])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (syncToPlayback && ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [list.length, syncToPlayback])
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-ink-500">
          {list.length} event(s){syncToPlayback ? ` up to ${fmt(Math.floor(t))}` : ''}
        </span>
        <Segmented<Mode>
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'impact', label: 'Impact' },
            { value: 'all', label: 'All movements' },
          ]}
        />
      </div>
      <div ref={ref} style={{ maxHeight: height }} className="space-y-1 overflow-y-auto pr-1" data-testid="event-log">
        {list.length === 0 && <div className="py-6 text-center text-xs text-ink-500">No events yet at this time.</div>}
        {list.map((e, i) => (
          <button
            key={e.event_id}
            onClick={() => {
              setT(e.timestamp)
              if (e.flight_id && !e.flight_id.startsWith('FERRY')) inspect(e.flight_id)
            }}
            className={cn(
              'flex w-full cursor-pointer items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs hover:border-ink-600 hover:bg-ink-800/70',
              syncToPlayback && i === list.length - 1 && 'border-ink-600 bg-ink-800/60',
            )}
          >
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[e.severity] }} />
            <span className="num w-11 shrink-0 text-ink-400">{fmt(e.timestamp)}</span>
            <span className="min-w-0 flex-1">
              <span className="mr-1.5 font-mono text-[10px] text-ink-500">
                {e.event_id} · {e.kind.replaceAll('_', ' ')}
              </span>
              <span className="block text-ink-200">{e.message}</span>
              {(e.previous_dependency || e.cumulative_delay > 0) && (
                <span className="mt-0.5 block text-[10px] text-ink-500">
                  {e.aircraft && `Aircraft ${e.aircraft} · `}
                  {e.previous_dependency && `depends on ${e.previous_dependency} · `}
                  {e.delay_introduced > 0 && `introduced +${e.delay_introduced}m · `}
                  {e.cumulative_delay > 0 && `cumulative ${e.cumulative_delay}m`}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
