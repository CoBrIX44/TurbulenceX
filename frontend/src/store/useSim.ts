import { create } from 'zustand'
import { api } from '@/lib/api'
import { timelineBounds } from '@/lib/playback'
import type {
  DispatcherResponse,
  Disruption,
  KPIs,
  ModelParameters,
  NetworkData,
  Preset,
  RecoveryAction,
  ScenarioInput,
  SimulateResponse,
  SimulationResult,
  SimulationSettings,
  StoredScenario,
} from '@/lib/types'

export type View = 'auto' | 'baseline' | 'disrupted' | 'recovered'

export interface Strategy {
  label: string
  actions: RecoveryAction[]
  kpis: KPIs
  recoveryPct: number | null
}

export interface ScenarioDraft {
  id: string | null
  name: string
  description: string
  disruptions: Disruption[]
  actions: RecoveryAction[]
  settings: SimulationSettings
}

const emptyScenario = (): ScenarioDraft => ({
  id: null,
  name: 'Untitled scenario',
  description: '',
  disruptions: [],
  actions: [],
  settings: { assume_standby_crew_for_spares: true },
})

interface SimState {
  network: NetworkData | null
  presets: Preset[]
  model: ModelParameters | null
  saved: StoredScenario[]
  bootError: string | null
  scenario: ScenarioDraft
  dirty: boolean
  running: boolean
  runError: string | null
  result: SimulateResponse | null
  lastRunAt: number | null
  view: View
  t: number
  playing: boolean
  speed: number
  dispatcher: DispatcherResponse | null
  dispatcherLoading: boolean
  dispatcherError: string | null
  dispatcherKey: string | null
  strategies: Strategy[]
  inspected: string | null
  toast: { kind: 'ok' | 'error' | 'info'; text: string } | null

  init: () => Promise<void>
  refreshSaved: () => Promise<void>
  run: () => Promise<void>
  addDisruption: (d: Disruption) => void
  updateDisruption: (id: string, d: Disruption) => void
  removeDisruption: (id: string) => void
  setSettings: (s: Partial<SimulationSettings>) => void
  setName: (name: string, description?: string) => void
  applyAction: (a: RecoveryAction) => Promise<void>
  removeAction: (index: number) => Promise<void>
  undoAction: () => Promise<void>
  clearActions: () => Promise<void>
  resetBaseline: () => Promise<void>
  loadPreset: (p: Preset) => Promise<void>
  loadScenario: (s: StoredScenario) => Promise<void>
  saveScenario: (asNew?: boolean) => Promise<void>
  setView: (v: View) => void
  setT: (t: number) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: number) => void
  askDispatcher: () => Promise<void>
  saveStrategy: (label: string) => void
  removeStrategy: (i: number) => void
  loadStrategy: (i: number) => Promise<void>
  inspect: (id: string | null) => void
  notify: (kind: 'ok' | 'error' | 'info', text: string) => void
}

export function scenarioInput(s: ScenarioDraft): ScenarioInput {
  return { disruptions: s.disruptions, actions: s.actions, settings: s.settings }
}

export const scenarioKey = (s: ScenarioDraft) => JSON.stringify(scenarioInput(s))

let booting: Promise<void> | null = null

export const useSim = create<SimState>((set, get) => ({
  network: null,
  presets: [],
  model: null,
  saved: [],
  bootError: null,
  scenario: emptyScenario(),
  dirty: false,
  running: false,
  runError: null,
  result: null,
  lastRunAt: null,
  view: 'auto',
  t: 300,
  playing: false,
  speed: 4,
  dispatcher: null,
  dispatcherLoading: false,
  dispatcherError: null,
  dispatcherKey: null,
  strategies: [],
  inspected: null,
  toast: null,

  init: async () => {
    if (booting) return booting
    booting = (async () => {
      try {
        const [network, presets, model] = await Promise.all([api.network(), api.presets(), api.model()])
        set({ network, presets, model, bootError: null })
        await get().refreshSaved()
        await get().run()
        const currentState = get()
        if (currentState.runError && !currentState.result) {
          set({ bootError: currentState.runError })
        }
      } catch (e) {
        set({ bootError: (e as Error).message })
      }
    })().finally(() => {
      booting = null
    })
    return booting
  },

  refreshSaved: async () => {
    try {
      set({ saved: await api.listScenarios() })
    } catch (e) {
      get().notify('error', (e as Error).message)
    }
  },

  run: async () => {
    const { scenario } = get()
    set({ running: true, runError: null })
    try {
      const result = await api.simulate(scenarioInput(scenario))
      if (!result || (!result.disrupted && !result.baseline)) {
        throw new Error('Simulation API returned an invalid response structure.')
      }
      const active = result.recovered ?? result.disrupted ?? result.baseline
      const [lo] = timelineBounds(active)
      const keepT = get().result !== null
      set({ result, running: false, dirty: false, lastRunAt: Date.now(), t: keepT ? get().t : lo })
    } catch (e) {
      set({ running: false, runError: (e as Error).message })
      get().notify('error', (e as Error).message)
    }
  },

  addDisruption: (d) => set((s) => ({ scenario: { ...s.scenario, disruptions: [...s.scenario.disruptions, d] }, dirty: true })),
  updateDisruption: (id, d) =>
    set((s) => ({ scenario: { ...s.scenario, disruptions: s.scenario.disruptions.map((x) => (x.id === id ? d : x)) }, dirty: true })),
  removeDisruption: (id) => set((s) => ({ scenario: { ...s.scenario, disruptions: s.scenario.disruptions.filter((x) => x.id !== id) }, dirty: true })),
  setSettings: (p) => set((s) => ({ scenario: { ...s.scenario, settings: { ...s.scenario.settings, ...p } }, dirty: true })),
  setName: (name, description) => set((s) => ({ scenario: { ...s.scenario, name, description: description ?? s.scenario.description } })),

  applyAction: async (a) => {
    set((s) => ({ scenario: { ...s.scenario, actions: [...s.scenario.actions, a] } }))
    await get().run()
    const r = get().result?.recovered
    const out = r?.actions[r.actions.length - 1]
    if (out && !out.applied) {
      // Engine rejected it — remove so the plan only contains feasible actions.
      set((s) => ({ scenario: { ...s.scenario, actions: s.scenario.actions.slice(0, -1) } }))
      get().notify('error', `Rejected by engine: ${out.message}`)
      await get().run()
    } else {
      get().notify('ok', 'Recovery action applied and simulation re-run')
    }
  },
  removeAction: async (i) => {
    set((s) => ({ scenario: { ...s.scenario, actions: s.scenario.actions.filter((_, k) => k !== i) } }))
    await get().run()
  },
  undoAction: async () => {
    if (!get().scenario.actions.length) return
    set((s) => ({ scenario: { ...s.scenario, actions: s.scenario.actions.slice(0, -1) } }))
    await get().run()
    get().notify('info', 'Last recovery action undone')
  },
  clearActions: async () => {
    set((s) => ({ scenario: { ...s.scenario, actions: [] } }))
    await get().run()
  },
  resetBaseline: async () => {
    set({ scenario: emptyScenario(), dispatcher: null, strategies: [], view: 'auto', playing: false })
    await get().run()
    get().notify('info', 'Reset to baseline schedule')
  },
  loadPreset: async (p) => {
    set({
      scenario: { ...emptyScenario(), name: p.name, description: p.description, disruptions: p.disruptions.map((d) => ({ ...d })) },
      dispatcher: null,
      strategies: [],
      view: 'auto',
    })
    await get().run()
  },
  loadScenario: async (s) => {
    set({
      scenario: { id: s.id, name: s.name, description: s.description, disruptions: s.disruptions, actions: s.actions, settings: s.settings },
      dispatcher: null,
      strategies: [],
      view: 'auto',
    })
    await get().run()
    get().notify('ok', `Loaded “${s.name}”`)
  },
  saveScenario: async (asNew = false) => {
    const sc = get().scenario
    const body = { name: sc.name, description: sc.description, disruptions: sc.disruptions, actions: sc.actions, settings: sc.settings }
    try {
      const saved = sc.id && !asNew ? await api.updateScenario(sc.id, body) : await api.createScenario(body)
      set((s) => ({ scenario: { ...s.scenario, id: saved.id, name: saved.name } }))
      await get().refreshSaved()
      get().notify('ok', `Saved “${saved.name}”`)
    } catch (e) {
      get().notify('error', (e as Error).message)
    }
  },

  setView: (view) => set({ view }),
  setT: (t) => set({ t }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),

  askDispatcher: async () => {
    const sc = get().scenario
    set({ dispatcherLoading: true, dispatcherError: null })
    try {
      const d = await api.dispatcher(scenarioInput(sc))
      set({ dispatcher: d, dispatcherLoading: false, dispatcherKey: scenarioKey(sc) })
    } catch (e) {
      set({ dispatcherLoading: false, dispatcherError: (e as Error).message })
    }
  },

  saveStrategy: (label) => {
    const r = get().result
    if (!r) return
    const k = (r.recovered ?? r.disrupted).kpis
    set((s) => ({ strategies: [...s.strategies, { label, actions: [...s.scenario.actions], kpis: k, recoveryPct: r.comparison.network_recovery_pct }] }))
  },
  removeStrategy: (i) => set((s) => ({ strategies: s.strategies.filter((_, k) => k !== i) })),
  loadStrategy: async (i) => {
    const st = get().strategies[i]
    if (!st) return
    set((s) => ({ scenario: { ...s.scenario, actions: [...st.actions] } }))
    await get().run()
  },

  inspect: (id) => set({ inspected: id }),
  notify: (kind, text) => {
    set({ toast: { kind, text } })
    window.setTimeout(() => {
      if (get().toast?.text === text) set({ toast: null })
    }, 3800)
  },
}))

/** The simulation result currently displayed. */
export function selectActive(s: Pick<SimState, 'result' | 'view'>): SimulationResult | null {
  const r = s.result
  if (!r) return null
  if (s.view === 'baseline') return r.baseline ?? null
  if (s.view === 'disrupted') return r.disrupted ?? null
  if (s.view === 'recovered') return r.recovered ?? r.disrupted ?? null
  return r.recovered ?? r.disrupted ?? r.baseline ?? null
}

export function activeLabel(s: Pick<SimState, 'result' | 'view'>): string {
  const r = s.result
  if (!r) return '—'
  if (s.view === 'baseline') return 'Baseline'
  if (s.view === 'disrupted' || !r.recovered) return r.disrupted.disruptions.length ? 'Disrupted' : 'Baseline'
  return 'Recovered'
}
