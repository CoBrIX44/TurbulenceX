import { ChevronDown, Clock, Loader2, Menu, Play, RotateCcw, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SeverityBadge } from '@/components/StatusBadge'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/form'
import { fmt } from '@/lib/time'
import { Logo } from './Sidebar'
import { selectActive, useSim, type View } from '@/store/useSim'

function ScenarioSelector() {
  const { scenario, presets, saved, loadPreset, loadScenario, resetBaseline } = useSim()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', h)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="scenario-selector"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Select scenario, current: ${scenario.name}`}
        className="flex h-9 max-w-[280px] cursor-pointer items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 text-left text-sm hover:border-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent"
      >
        <span className="text-[10px] uppercase font-semibold tracking-wider text-ink-400">Scenario</span>
        <span className="truncate font-medium text-ink-100">{scenario.name}</span>
        {scenario.id ? (
          <span className="h-2 w-2 rounded-full bg-ok" title="Saved scenario" />
        ) : (
          <span className="h-2 w-2 rounded-full bg-ink-500" title="Unsaved scenario" />
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      </button>

      {open && (
        <div role="menu" aria-label="Available scenarios" className="absolute left-0 top-full z-[1100] mt-1.5 w-80 overflow-hidden rounded-xl border border-ink-600 bg-ink-900 shadow-2xl animate-fade-in">
          <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
            Standard Templates
          </div>
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setOpen(false)
                void loadPreset(p)
              }}
              className="block w-full cursor-pointer px-3 py-2 text-left hover:bg-ink-800 focus-visible:bg-ink-800 focus-visible:outline-none"
            >
              <div className="text-sm font-medium text-ink-100">{p.name}</div>
              <div className="text-[11px] text-ink-400">{p.description}</div>
            </button>
          ))}
          {saved.length > 0 && (
            <div className="border-t border-ink-700 px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              Saved scenarios
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {saved.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  void loadScenario(s)
                }}
                className="block w-full cursor-pointer px-3 py-2 text-left text-sm text-ink-100 hover:bg-ink-800 focus-visible:bg-ink-800 focus-visible:outline-none"
              >
                <div className="font-medium text-ink-100">{s.name}</div>
                <div className="text-[11px] text-ink-400">
                  {s.disruptions.length} disruption(s) · {s.actions.length} action(s)
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              void resetBaseline()
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-t border-ink-700 px-3 py-2.5 text-left text-sm text-ink-300 hover:bg-ink-800 hover:text-ink-100 focus-visible:bg-ink-800 focus-visible:outline-none"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to Baseline
          </button>
        </div>
      )}
    </div>
  )
}

export function TopBar({ onOpenMobile }: { onOpenMobile?: () => void }) {
  const s = useSim()
  const active = selectActive(s)
  const k = active?.kpis
  const hasRecovered = !!s.result?.recovered

  return (
    <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-ink-800 bg-ink-950 px-4 py-2">
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={onOpenMobile}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-ink-700 bg-ink-900 text-ink-300 hover:text-ink-100"
        >
          <Menu className="h-5 w-5" />
        </button>
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

      <div
        className="flex items-center gap-1.5 rounded-lg border border-ink-750 bg-ink-900 px-2.5 py-1.5"
        title="Simulated operating time (IST)"
      >
        <Clock className="h-3.5 w-3.5 text-sky-accent" />
        <span className="num text-sm font-semibold text-ink-100" data-testid="sim-clock">
          {fmt(s.t)}
        </span>
        <span className="text-[10px] font-mono text-ink-400">IST</span>
      </div>

      {k && (
        <div className="flex items-center gap-2" data-testid="network-status">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-400">Network</span>
          <SeverityBadge severity={k.severity} />
          <span className="num text-xs font-semibold text-ink-200">{k.otp_pct}% OTP</span>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        {s.dirty && (
          <span className="rounded bg-amber-950/80 border border-amber-800/60 px-2 py-0.5 text-[11px] font-medium text-amber-300">
            Inputs changed — run required
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={() => void s.saveScenario()} title="Save scenario" aria-label="Save scenario">
          <Save className="h-3.5 w-3.5" /> Save
        </Button>
        <Button
          variant="primary"
          onClick={() => void s.run()}
          disabled={s.running}
          data-testid="run-simulation"
        >
          {s.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run simulation
        </Button>
      </div>
    </header>
  )
}
