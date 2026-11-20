import { CloudLightning, ListTree } from 'lucide-react'
import { RotationGantt } from '@/components/Charts'
import { DisruptionPanel } from '@/components/DisruptionPanel'
import { EventLog } from '@/components/EventLog'
import { Page } from '@/components/layout/AppLayout'
import { PlaybackBar } from '@/components/Playback'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/form'
import { phaseAt } from '@/lib/playback'
import { selectActive, useSim } from '@/store/useSim'

export function SimulationsPage() {
  const s = useSim()
  const r = selectActive(s)!
  const t = s.t
  const phases = r.flights.reduce(
    (acc, f) => {
      acc[phaseAt(f, t)]++
      return acc
    },
    { scheduled: 0, held: 0, airborne: 0, arrived: 0, cancelled: 0 } as Record<string, number>,
  )
  const connFailed = r.events.filter((e) => e.kind === 'CONNECTION_MISSED' && e.timestamp <= t).length
  const crewWarn = r.events.filter((e) => e.kind === 'CREW_DUTY_VIOLATION' && e.timestamp <= t).length
  return (
    <Page title="Simulations" subtitle="Configure disruptions, run the deterministic engine and replay the operating day">
      <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              icon={<CloudLightning className="h-4 w-4" />}
              title="Disruption configuration"
              subtitle="Create, edit or remove disruptions, then run"
            />
            <CardBody>
              <DisruptionPanel />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Modelling assumptions" />
            <CardBody className="space-y-2 text-xs text-ink-300">
              <Switch
                checked={s.scenario.settings.assume_standby_crew_for_spares}
                onChange={(v) => s.setSettings({ assume_standby_crew_for_spares: v })}
                label={<span className="text-xs">Assume a standby crew is available with each spare aircraft</span>}
              />
              <p className="text-ink-500">The dataset contains no reserve crews. With this off, spare deployment is infeasible.</p>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Simulation playback" subtitle="Simulated operating time — not live flight tracking" />
            <CardBody className="space-y-3">
              <PlaybackBar />
              <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-7" data-testid="phase-counts">
                {[
                  ['Scheduled', phases.scheduled, 'text-ink-300'],
                  ['Held / late', phases.held, 'text-amber-300'],
                  ['Airborne', phases.airborne, 'text-cyan-200'],
                  ['Arrived', phases.arrived, 'text-green-300'],
                  ['Cancelled', phases.cancelled, 'text-slate-300'],
                  ['Conn. failures', connFailed, 'text-red-300'],
                  ['Crew warnings', crewWarn, 'text-red-300'],
                ].map(([l, v, c]) => (
                  <div key={l as string} className="rounded-lg border border-ink-700 bg-ink-900 py-2">
                    <div className={`num text-lg font-semibold ${c}`}>{v}</div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-500">{l}</div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              icon={<ListTree className="h-4 w-4" />}
              title="Aircraft rotations"
              subtitle="Grey = scheduled · colour = actual (green on time, amber delayed, red severe, dashed cancelled, mint = ferry). Red bands = disruption windows."
            />
            <CardBody>
              <RotationGantt result={r} t={t} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Event log" subtitle="Synchronised with playback — click an event to jump and inspect" />
            <CardBody>
              <EventLog events={r.events} t={t} height={420} />
            </CardBody>
          </Card>
        </div>
      </div>
    </Page>
  )
}
