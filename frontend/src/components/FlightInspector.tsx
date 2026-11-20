import { Background, ReactFlow, type Edge, type Node } from '@xyflow/react'
import { Clock, GitBranch, Link2, Plane, Users } from 'lucide-react'
import { useMemo } from 'react'
import { StatusBadge } from '@/components/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Drawer } from '@/components/ui/misc'
import { traceBackward, traceForward } from '@/lib/filters'
import { REASON_LABEL, rootLabel, STATUS_COLOR } from '@/lib/labels'
import { fmt } from '@/lib/time'
import type { FlightResult, SimulationResult } from '@/lib/types'
import { cn } from '@/lib/utils'
import { selectActive, useSim } from '@/store/useSim'

function CausalGraph({ result, flight }: { result: SimulationResult; flight: FlightResult }) {
  const inspect = useSim((s) => s.inspect)
  const { nodes, edges } = useMemo(() => {
    const byId = Object.fromEntries(result.flights.map((f) => [f.flight_id, f]))
    const back = traceBackward(byId, flight.flight_id)
    const fwd = traceForward(result.flights, flight.flight_id)
    const ids = [...new Set([...back, ...fwd])]
    // depth = longest parent chain within the set
    const depth: Record<string, number> = {}
    const d = (id: string): number => {
      if (depth[id] !== undefined) return depth[id]
      const ps = byId[id].delay_parents.filter((p) => ids.includes(p))
      depth[id] = ps.length ? Math.max(...ps.map(d)) + 1 : 1
      return depth[id]
    }
    ids.forEach(d)
    const cols: Record<number, string[]> = {}
    ids.forEach((id) => (cols[depth[id]] = [...(cols[depth[id]] ?? []), id]))
    const nodes: Node[] = []
    const edges: Edge[] = []
    const root = byId[back[0]]?.root_cause
    if (root) {
      const dis = root.startsWith('disruption:') ? result.disruptions.find((x) => `disruption:${x.id}` === root) : null
      nodes.push({
        id: 'root',
        position: { x: 0, y: 0 },
        data: { label: dis ? `${dis.airport} ${dis.type.replace('_', ' ')}\n${dis.start} · ${dis.duration_min}m` : root.replace(/_/g, ' ') },
        style: { background: '#3b0d12', color: '#fecaca', border: '1px solid #ef4444', borderRadius: 8, fontSize: 11, width: 150, whiteSpace: 'pre-line' },
        sourcePosition: 'right' as never,
        targetPosition: 'left' as never,
      })
    }
    for (const [col, list] of Object.entries(cols)) {
      list.sort().forEach((id, row) => {
        const f = byId[id]
        const me = id === flight.flight_id
        nodes.push({
          id,
          position: { x: Number(col) * 180, y: row * 74 },
          data: {
            label: `${id}  ${f.origin}→${f.destination}\n${f.status === 'cancelled' ? 'cancelled' : `+${f.arr_delay}m`} · ${REASON_LABEL[f.primary_reason] ?? f.primary_reason}`,
          },
          style: {
            background: me ? '#0e3a47' : '#0f1d35',
            color: '#e6eefb',
            border: `1.5px solid ${STATUS_COLOR[f.status]}`,
            borderRadius: 8,
            fontSize: 11,
            width: 158,
            whiteSpace: 'pre-line',
            boxShadow: me ? '0 0 0 2px #22d3ee' : undefined,
            cursor: 'pointer',
          },
          sourcePosition: 'right' as never,
          targetPosition: 'left' as never,
        })
        const parents = f.delay_parents.filter((p) => ids.includes(p))
        if (parents.length === 0 && root) edges.push({ id: `root-${id}`, source: 'root', target: id, animated: true, style: { stroke: '#ef4444' } })
        for (const p of parents) edges.push({ id: `${p}-${id}`, source: p, target: id, animated: true, style: { stroke: '#f59e0b' } })
      })
    }
    return { nodes, edges }
  }, [result, flight])
  if (nodes.length <= 1) return <p className="text-xs text-ink-400">No causal dependencies: this flight's timing does not depend on another delayed flight.</p>
  return (
    <div className="h-64 rounded-lg border border-ink-700 bg-ink-950" data-testid="causal-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, n) => n.id !== 'root' && inspect(n.id)}
      >
        <Background color="#16284a" gap={18} />
      </ReactFlow>
    </div>
  )
}

function RotationTimeline({ legs, current }: { legs: FlightResult[]; current: string }) {
  const inspect = useSim((s) => s.inspect)
  if (!legs.length) return null
  const lo = Math.min(...legs.map((l) => l.sched_dep)) - 30
  const hi = Math.max(...legs.map((l) => l.actual_arr ?? l.sched_arr)) + 30
  const pct = (m: number) => `${((m - lo) / (hi - lo)) * 100}%`
  return (
    <div className="space-y-1.5">
      {legs.map((l) => (
        <button
          key={l.flight_id}
          type="button"
          aria-label={`Inspect rotation leg ${l.flight_id} from ${l.origin} to ${l.destination}`}
          onClick={() => !l.is_ferry && inspect(l.flight_id)}
          className={cn('flex w-full cursor-pointer items-center gap-2 rounded px-1 text-left hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-accent', l.flight_id === current && 'bg-ink-800')}
        >
          <span className="num w-20 shrink-0 text-[11px] text-ink-300">{l.flight_id.replace('FERRY-', 'FRY-')}</span>
          <span className="relative h-5 flex-1">
            <span
              className="absolute top-1 h-1.5 rounded-full bg-ink-600"
              style={{ left: pct(l.sched_dep), width: `calc(${pct(l.sched_arr)} - ${pct(l.sched_dep)})` }}
              title={`Scheduled ${fmt(l.sched_dep)}–${fmt(l.sched_arr)}`}
            />
            {l.actual_dep !== null && l.actual_arr !== null && (
              <span
                className="absolute top-2.5 h-2 rounded-full"
                style={{
                  left: pct(l.actual_dep),
                  width: `calc(${pct(l.actual_arr)} - ${pct(l.actual_dep)})`,
                  background: l.is_ferry ? '#34d399' : STATUS_COLOR[l.status],
                }}
                title={`Actual ${fmt(l.actual_dep)}–${fmt(l.actual_arr)}`}
              />
            )}
          </span>
          <span className="num w-24 shrink-0 text-right text-[11px] text-ink-400">
            {l.origin}→{l.destination}
          </span>
          <span className={cn('num w-12 shrink-0 text-right text-[11px]', l.arr_delay >= 15 ? 'text-amber-300' : 'text-ink-400')}>
            {l.status === 'cancelled' ? 'CNX' : `+${l.arr_delay}m`}
          </span>
        </button>
      ))}
      <div className="flex gap-4 pl-[88px] text-[10px] text-ink-500">
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-4 rounded bg-ink-600" /> scheduled
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-4 rounded bg-ok" /> actual
        </span>
      </div>
    </div>
  )
}

export function FlightInspector() {
  const s = useSim()
  const result = selectActive(s)
  const id = s.inspected
  const f = result?.flights.find((x) => x.flight_id === id)
  const legs = useMemo(() => {
    if (!result || !f) return []
    const tail = f.operating_tail ?? f.tail_id
    const all = [...result.flights, ...result.ferries]
    return all.filter((x) => x.operating_tail === tail || (x.tail_id === f.tail_id && !x.operating_tail)).sort((a, b) => a.sched_dep - b.sched_dep)
  }, [result, f])
  const conns = result?.connections.filter((c) => c.from_flight === id || c.to_flight === id) ?? []
  const crew = result?.crews.find((c) => c.crew_id === f?.crew_id)
  return (
    <Drawer
      open={!!f}
      onClose={() => s.inspect(null)}
      title={
        f && (
          <span className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-sky-accent" /> Flight inspector · <span className="num text-cyan-200">{f.flight_id}</span> {f.origin} →{' '}
            {f.destination} <StatusBadge status={f.status} />
          </span>
        )
      }
    >
      {f && result && (
        <div className="space-y-5 p-5 text-sm" data-testid="flight-inspector">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Scheduled dep', fmt(f.sched_dep)],
              ['Actual dep', fmt(f.actual_dep)],
              ['Scheduled arr', fmt(f.sched_arr)],
              ['Actual arr', fmt(f.actual_arr)],
              ['Departure delay', `${f.dep_delay} min`],
              ['Arrival delay', `${f.arr_delay} min`],
              ['Passengers', String(f.pax)],
              ['Block time', `${f.block_minutes} min`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-ink-500">{k}</div>
                <div className="num mt-0.5 text-ink-100">{v}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="cyan">Scheduled aircraft {f.tail_id}</Badge>
            {f.operating_tail && f.operating_tail !== f.tail_id && <Badge tone="recover">Operated by {f.operating_tail}</Badge>}
            {f.crew_id && (
              <Badge tone={crew?.violation ? 'crit' : 'neutral'}>
                Crew {f.crew_id}
                {crew?.is_standby ? ' (assumed standby)' : ''}
              </Badge>
            )}
            {f.root_cause && <Badge tone="warn">Root cause: {rootLabel(f.root_cause, result.disruptions)}</Badge>}
            <Button size="sm" variant="ghost" onClick={() => s.setT(f.sched_dep)}>
              <Clock className="h-3.5 w-3.5" /> Jump playback to departure
            </Button>
          </div>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Why</h4>
            <p className="rounded-lg border border-ink-700 bg-ink-850 p-3 leading-relaxed text-ink-200">{f.explanation}</p>
            {f.components.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {f.components.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-44 shrink-0 text-ink-300">{REASON_LABEL[c.kind] ?? c.kind}</span>
                    <span
                      className="h-2 rounded bg-warn/70"
                      style={{ width: `${Math.min(100, (c.minutes / Math.max(1, f.arr_delay, f.dep_delay)) * 100)}%`, minWidth: 4 }}
                    />
                    <span className="num text-amber-200">+{c.minutes}m</span>
                    {c.source_flight && (
                      <button
                        type="button"
                        aria-label={`Inspect delay source flight ${c.source_flight}`}
                        className="cursor-pointer text-cyan-300 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-accent rounded"
                        onClick={() => s.inspect(c.source_flight)}
                      >
                        from {c.source_flight}
                      </button>
                    )}
                  </div>
                ))}
                <div className="text-[11px] text-ink-500">
                  Inherited from previous leg: {f.inherited_delay}m · Introduced on this leg: {f.introduced_delay}m
                </div>
              </div>
            )}
          </section>

          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
              <GitBranch className="h-3.5 w-3.5" /> Causal chain (backward ← → forward)
            </h4>
            <CausalGraph result={result} flight={f} />
          </section>

          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Aircraft rotation · {f.operating_tail ?? f.tail_id}</h4>
            <RotationTimeline legs={legs} current={f.flight_id} />
          </section>

          {conns.length > 0 && (
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">
                <Link2 className="h-3.5 w-3.5" /> Passenger connections
              </h4>
              <div className="space-y-1.5">
                {conns.map((c) => (
                  <div key={c.connection_id} className="rounded-lg border border-ink-700 bg-ink-850 p-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="num font-semibold">{c.connection_id}</span>
                      <span className="num text-ink-300">
                        {c.from_flight} → {c.to_flight} @ {c.airport}
                      </span>
                      <Users className="ml-auto h-3.5 w-3.5 text-ink-500" />
                      <span className="num">{c.passengers}</span>
                      <Badge tone={c.status === 'made' ? 'ok' : 'crit'}>{c.status.replace('_', ' ')}</Badge>
                    </div>
                    <div className="mt-1 text-ink-400">{c.reason}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}
