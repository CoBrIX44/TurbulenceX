import type {
  DispatcherResponse,
  EvaluatedAction,
  ModelParameters,
  NetworkData,
  Preset,
  RecoveryAction,
  ScenarioInput,
  SimulateResponse,
  StoredScenario,
  ValidationReport,
} from './types'

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the Domino Sky API. Is the backend running on port 8000?')
  }
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') msg = body.detail
      else if (Array.isArray(body.detail))
        msg = body.detail.map((d: { loc?: unknown[]; msg: string }) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`).join('; ')
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

const post = <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  network: () => request<NetworkData>('/api/network'),
  validation: () => request<ValidationReport>('/api/validation'),
  model: () => request<ModelParameters>('/api/model'),
  presets: () => request<Preset[]>('/api/presets'),
  simulate: (s: ScenarioInput) => post<SimulateResponse>('/api/simulate', s),
  evaluate: (scenario: ScenarioInput, action: RecoveryAction) => post<EvaluatedAction>('/api/recovery/evaluate', { scenario, action }),
  candidates: (s: ScenarioInput) => post<EvaluatedAction[]>('/api/recovery/candidates', s),
  dispatcher: (s: ScenarioInput) => post<DispatcherResponse>('/api/dispatcher/recommend', s),
  listScenarios: () => request<StoredScenario[]>('/api/scenarios'),
  createScenario: (body: Omit<StoredScenario, 'id' | 'created_at' | 'updated_at'>) => post<StoredScenario>('/api/scenarios', body),
  updateScenario: (id: string, body: Omit<StoredScenario, 'id' | 'created_at' | 'updated_at'>) =>
    request<StoredScenario>(`/api/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteScenario: (id: string) => request<void>(`/api/scenarios/${id}`, { method: 'DELETE' }),
  duplicateScenario: (id: string) => post<StoredScenario>(`/api/scenarios/${id}/duplicate`, {}),
  async exportScenario(name: string, scenario: ScenarioInput, format: 'json' | 'csv'): Promise<void> {
    const res = await fetch(`${BASE}/api/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, scenario, format }),
    })
    if (!res.ok) throw new ApiError(res.status, 'Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/[^\w-]+/g, '_') || 'scenario'}.${format}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}
