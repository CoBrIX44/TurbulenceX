import { ChevronDown, Clock, Loader2, Play, RotateCcw, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SeverityBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/form'
import { fmt } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Logo } from './Sidebar'
import { selectActive, useSim, type View } from '@/store/useSim'

function ScenarioSelector() {
  const { scenario, presets, saved, loadPreset, loadScenario, resetBaseline } = useSim()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative">
      <button
        data-testid="scenario-selector"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 max-w-[280px] cursor-pointer items-center gap-2 rounded-lg border border-ink-600 bg-ink-900 px-3 text-left text-sm hover:border-ink-500"
      >
        <span className="text-[10px] uppercase tracking-wider text-ink-500">Scenario</span>
        <span className="truncate font-medium text-ink-100">{scenario.name}</span>
        {scenario.id ? (
          <span className="h-1.5 w-1.5 rounded-full bg-ok" title="Saved" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-ink-500" title="Unsaved" />
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[1100] mt-1 w-80 overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl animate-fade-in">
          <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-ink-500">Templates</div>
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false)
                void loadPreset(p)
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-ink-800"
            >
              <div className="text-sm text-ink-100">{p.name}</div>
              <div className="text-[11px] text-ink-400">{p.description}</div>
            </button>
          ))}
          {saved.length > 0 && (
            <div className="border-t border-ink-700 px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-ink-500">Saved scenarios</div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {saved.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setOpen(false)
                  void loadScenario(s)
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-800"
              >
                {s.name}
                <span className="ml-2 text-[11px] text-ink-500">
                  {s.disruptions.length} disruption(s) · {s.actions.length} action(s)
                </span>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              setOpen(false)
              void resetBaseline()
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-t border-ink-700 px-3 py-2 text-left text-sm text-ink-300 hover:bg-ink-800"
          >
            <RotateCcw className="h-3.5 w-3.5" /> New scenario (baseline)
          </button>
        </div>
      )}
    </div>
  )
}

export function TopBar() {
  const s = useSim()
  const active = selectActive(s)
  const k = active?.kpis
  const hasRecovered = !!s.result?.recovered
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-ink-700/80 bg-ink-900/70 px-4 py-2 backdrop-blur">
      <div className="md:hidden">
        <Logo compact />
      </div>
      <ScenarioSelector />
      <Segmented<View>
        value={s.view === 'auto' ? (hasRecovered ? 'recovered' : 'disrupted') : s.view}
        onChange={s.setView}
        options={[
          { value: 'baseline', label: 'Baseline' },
          { value: 'disrupted', label: 'Disrupted' },
          { value: 'recovered', label: 'Recovered', disabled: !hasRecovered },
        ]}
      />
      <div className="flex items-center gap-1.5 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5" title="Simulated operating time (IST)">
        <Clock className="h-3.5 w-3.5 text-sky-accent" />
        <span className="num text-sm text-ink-100" data-testid="sim-clock">
          {fmt(s.t)}
        </span>
        <span className="text-[10px] text-ink-500">IST</span>
      </div>
      {k && (
        <div className="flex items-center gap-2" data-testid="network-status">
          <span className="text-[10px] uppercase tracking-wider text-ink-500">Network</span>
          <SeverityBadge severity={k.severity} />
          <span className="num text-xs text-ink-300">{k.otp_pct}% OTP</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {s.dirty && <span className="text-[11px] text-amber-300">Inputs changed — run to update</span>}
        <Button variant="ghost" size="sm" onClick={() => void s.saveScenario()} title="Save scenario">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        <Button variant="primary" onClick={() => void s.run()} disabled={s.running} data-testid="run-simulation" className={cn(s.dirty && 'animate-pulse')}>
          {s.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run simulation
        </Button>
      </div>
    </header>
  )
}
