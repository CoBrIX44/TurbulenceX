import { AlertTriangle, Bot, Cpu, RefreshCw, UserX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ActionCard } from '@/components/ActionCard'
import { Page } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Empty, Spinner } from '@/components/ui/misc'
import { n } from '@/lib/utils'
import { scenarioKey, useSim } from '@/store/useSim'

export function DispatcherPage() {
  const s = useSim()
  const d = s.dispatcher
  const stale = d && s.dispatcherKey !== scenarioKey(s.scenario)
  const hasDisruption = s.scenario.disruptions.length > 0
  return (
    <Page
      title="Automated Dispatcher &amp; Recovery"
      subtitle="Simulation engine → calculated state → AI / rule dispatcher → structured recommendation → deterministic validation → UI"
      actions={
        <Button variant="ai" onClick={() => void s.askDispatcher()} disabled={s.dispatcherLoading || !hasDisruption} data-testid="ask-dispatcher">
          {s.dispatcherLoading ? <Spinner /> : d ? <RefreshCw className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          {d ? 'Re-analyse current state' : 'Compute recovery recommendations'}
        </Button>
      }
    >
      {!hasDisruption && (
        <Card>
          <Empty
            icon={<Bot className="h-7 w-7" />}
            title="No disruption to recover from"
            action={
              <Link to="/simulations">
                <Button variant="outline" size="sm">
                  Configure a disruption
                </Button>
              </Link>
            }
          >
            The dispatcher analyses a disrupted simulation. Configure and run a disruption first (for example, a 90-minute closure at BOM).
          </Empty>
        </Card>
      )}
      {s.dispatcherError && <div className="rounded-lg border border-crit/40 bg-crit/5 p-3 text-sm text-red-200">{s.dispatcherError}</div>}
      {hasDisruption && !d && !s.dispatcherLoading && (
        <Card>
          <Empty icon={<Cpu className="h-7 w-7 text-ai" />} title="Request recovery candidate evaluation">
            The engine enumerates candidate actions (spare deployment, cancellations, aircraft swaps, connection protection), simulates each one, and the
            dispatcher selects and explains the best. If no LLM API key is configured, a deterministic rule-based engine produces the recommendations and the
            source is clearly labelled.
          </Empty>
        </Card>
      )}
      {s.dispatcherLoading && (
        <Card>
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-ink-300">
            <Spinner /> Simulating candidate recovery actions…
          </div>
        </Card>
      )}
      {d && !s.dispatcherLoading && (
        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Card className={d.source === 'llm' ? 'border-ai/40' : ''}>
              <CardHeader
                icon={d.source === 'llm' ? <Bot className="h-4 w-4 text-ai" /> : <Cpu className="h-4 w-4" />}
                title="Situation assessment"
                subtitle={`${d.candidates_evaluated} improving candidate action(s) found by simulation`}
                actions={
                  <Badge tone={d.source === 'llm' ? 'ai' : 'neutral'} data-testid="dispatcher-source">
                    {d.source === 'llm' ? `LLM-generated · ${d.model}` : 'Rule-based fallback engine'}
                  </Badge>
                }
              />
              <CardBody className="space-y-2 text-sm leading-relaxed text-ink-200">
                {stale && (
                  <div className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1.5 text-xs text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5" /> Scenario changed since this analysis — re-analyse for current recommendations.
                  </div>
                )}
                {d.provider_error && (
                  <div className="rounded-md border border-warn/40 bg-warn/5 px-2.5 py-1.5 text-xs text-amber-200">
                    LLM unavailable ({d.provider_error}); showing rule-based recommendations.
                  </div>
                )}
                <p data-testid="situation-summary">{d.situation_summary}</p>
                {d.source === 'llm' && (
                  <p className="text-[11px] text-ink-500">Narrative written by the LLM. All figures in recommendation cards come from the simulation engine.</p>
                )}
                {d.unverified_numbers.length > 0 && (
                  <div className="rounded-md border border-crit/40 bg-crit/5 px-2.5 py-1.5 text-xs text-red-200">
                    Unverified figures in the LLM narrative (not present in engine output): {d.unverified_numbers.join(', ')} — disregard them.
                  </div>
                )}
              </CardBody>
            </Card>
            {d.recommendations.length === 0 && (
              <Card>
                <Empty title="No improving recovery action found">The engine found no feasible candidate that reduces the passenger impact index.</Empty>
              </Card>
            )}
            {d.recommendations.map((r) => (
              <ActionCard
                key={r.candidate_id}
                testId={`rec-${r.rank}`}
                title={`${r.rank}. ${r.title}`}
                badges={
                  <>
                    <Badge tone="cyan">{r.category}</Badge>
                    <Badge tone={r.reason_source === 'llm' ? 'ai' : 'neutral'}>
                      {r.proposed_by === 'llm_proposed' ? 'LLM-proposed · engine-validated' : r.proposed_by === 'llm_selected' ? 'LLM-selected' : 'Rule-based'}
                    </Badge>
                  </>
                }
                reasonLabel={r.reason_source === 'llm' ? 'Reasoning (LLM)' : 'Reasoning (rule engine, from computed values)'}
                reason={r.reason}
                action={r.action}
                impact={r.impact}
                flights={r.flights_affected}
                tradeOffs={r.trade_offs}
                risks={r.risks}
                checks={r.checks}
                feasibility={r.feasibility_status}
              />
            ))}
            {d.rejected.length > 0 && (
              <Card>
                <CardHeader title="Proposals rejected by deterministic validation" />
                <CardBody className="space-y-1.5">
                  {d.rejected.map((x, i) => (
                    <div key={i} className="text-xs text-ink-400">
                      <span className="font-mono text-ink-500">{JSON.stringify(x.proposal)}</span> — {x.reason}
                    </div>
                  ))}
                </CardBody>
              </Card>
            )}
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader icon={<UserX className="h-4 w-4 text-red-300" />} title="Crew duty violations" subtitle="Identified by the engine" />
              <CardBody className="space-y-2">
                {d.crew_alerts.length === 0 && <p className="text-xs text-ink-400">No crew exceeds its duty limit in the current plan.</p>}
                {d.crew_alerts.map((c) => (
                  <div key={c.crew_id} className="rounded-lg border border-crit/30 bg-crit/5 p-2.5 text-xs">
                    <div className="font-semibold text-red-200">
                      {c.crew_id} · {c.tail_id} · +{c.excess_mins} min over limit
                    </div>
                    <div className="mt-1 text-ink-300">{c.explanation}</div>
                  </div>
                ))}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Recovery priority" subtitle="Ranked by passenger-delay minutes (pax × delay)" />
              <CardBody className="space-y-1.5">
                {d.priority_flights.map((p, i) => (
                  <button
                    key={p.flight_id}
                    type="button"
                    aria-label={`Inspect priority flight ${p.flight_id} on route ${p.route}`}
                    onClick={() => s.inspect(p.flight_id)}
                    className="block w-full cursor-pointer rounded-lg border border-ink-700 bg-ink-900 p-2 text-left text-xs hover:border-ink-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-accent"
                  >
                    <div className="flex items-center gap-2">
                      <span className="num text-ink-500">{i + 1}</span>
                      <span className="num font-semibold text-cyan-200">{p.flight_id}</span>
                      <span className="num text-ink-300">{p.route}</span>
                      <span className="num ml-auto text-amber-300">+{p.arr_delay}m</span>
                    </div>
                    <div className="num mt-0.5 text-ink-500">
                      {p.pax} pax · {n(p.passenger_delay_minutes)} pax·min
                    </div>
                  </button>
                ))}
              </CardBody>
            </Card>
          </div>
        </div>
      )}
    </Page>
  )
}
