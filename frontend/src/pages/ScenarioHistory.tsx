import { Copy, Download, FileJson, FolderOpen, GitCompare, Pencil, Save, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Page } from '@/components/layout/AppLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Field, Input, Textarea } from '@/components/ui/form'
import { Empty, Modal, Spinner } from '@/components/ui/misc'
import { api } from '@/lib/api'
import { describeAction, typeLabel } from '@/lib/labels'
import type { KPIs, StoredScenario } from '@/lib/types'
import { n } from '@/lib/utils'
import { scenarioInput, useSim } from '@/store/useSim'

const CMP: [keyof KPIs, string][] = [
  ['delayed', 'Delayed flights'],
  ['severe', 'Severe delays'],
  ['cancelled', 'Cancelled'],
  ['total_arr_delay_min', 'Delay minutes'],
  ['missed_connections', 'Missed connections'],
  ['missed_connection_pax', 'Missed-conn. pax'],
  ['distinct_affected_pax_estimate', 'Affected pax (est.)'],
  ['crew_violations', 'Crew violations'],
  ['spares_used', 'Spares used'],
  ['otp_pct', 'OTP %'],
  ['impact_index', 'Impact index'],
]

export function ScenarioHistoryPage() {
  const s = useSim()
  const [selected, setSelected] = useState<string[]>([])
  const [cmp, setCmp] = useState<{ name: string; kpis: KPIs; recovery: number | null }[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [rename, setRename] = useState<StoredScenario | null>(null)
  const [newName, setNewName] = useState('')

  const compare = async () => {
    setBusy(true)
    try {
      const items = s.saved.filter((x) => selected.includes(x.id))
      const out = await Promise.all(
        items.map(async (x) => {
          const r = await api.simulate({ disruptions: x.disruptions, actions: x.actions, settings: x.settings })
          return { name: x.name, kpis: (r.recovered ?? r.disrupted).kpis, recovery: r.recovered ? r.comparison.network_recovery_pct : null }
        }),
      )
      setCmp(out)
    } catch (e) {
      s.notify('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const exp = (name: string, input: Parameters<typeof api.exportScenario>[1], fmt: 'json' | 'csv') =>
    api.exportScenario(name, input, fmt).catch((e) => s.notify('error', (e as Error).message))

  return (
    <Page title="Scenario History" subtitle="Create, name, save, duplicate, compare and export scenarios (stored by the backend as JSON)">
      <Card>
        <CardHeader icon={<Save className="h-4 w-4" />} title="Current scenario" subtitle={s.scenario.id ? `Saved · id ${s.scenario.id}` : 'Not saved yet'} />
        <CardBody className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
          <Field label="Name">
            <Input value={s.scenario.name} onChange={(e) => s.setName(e.target.value)} maxLength={120} data-testid="scenario-name" />
          </Field>
          <Field label="Description">
            <Textarea rows={1} value={s.scenario.description} onChange={(e) => s.setName(s.scenario.name, e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="primary" onClick={() => void s.saveScenario()} disabled={!s.scenario.name.trim()} data-testid="save-scenario">
              <Save className="h-4 w-4" /> {s.scenario.id ? 'Save changes' : 'Save'}
            </Button>
            {s.scenario.id && (
              <Button variant="outline" onClick={() => void s.saveScenario(true)}>
                Save as new
              </Button>
            )}
            <Button variant="ghost" onClick={() => void exp(s.scenario.name, scenarioInput(s.scenario), 'json')}>
              <FileJson className="h-4 w-4" /> JSON
            </Button>
            <Button variant="ghost" onClick={() => void exp(s.scenario.name, scenarioInput(s.scenario), 'csv')}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
          <div className="text-xs text-ink-400 lg:col-span-3">
            {s.scenario.disruptions.length} disruption(s):{' '}
            {s.scenario.disruptions.map((d) => `${d.airport} ${typeLabel(d.type)} ${d.start} (${d.duration_min}m)`).join(', ') || 'none'} ·{' '}
            {s.scenario.actions.length} recovery action(s)
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader
            icon={<FolderOpen className="h-4 w-4" />}
            title="Saved scenarios"
            subtitle="Select two or more to compare"
            actions={
              <Button size="sm" variant="outline" disabled={selected.length < 2 || busy} onClick={() => void compare()} data-testid="compare-scenarios">
                {busy ? <Spinner /> : <GitCompare className="h-3.5 w-3.5" />} Compare ({selected.length})
              </Button>
            }
          />
          <CardBody className="space-y-2" data-testid="saved-list">
            {s.saved.length === 0 && <Empty title="No saved scenarios">Use “Save” above (or in the top bar) to persist the current scenario.</Empty>}
            {s.saved.map((x) => (
              <div key={x.id} className="flex flex-wrap items-start gap-3 rounded-lg border border-ink-700 bg-ink-900 p-3">
                <input
                  type="checkbox"
                  aria-label={`Select ${x.name}`}
                  className="mt-1 h-4 w-4 cursor-pointer accent-cyan-400"
                  checked={selected.includes(x.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, x.id] : selected.filter((i) => i !== x.id))}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-ink-100">{x.name}</span>
                    {s.scenario.id === x.id && <Badge tone="cyan">loaded</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-400">
                    {x.disruptions.map((d) => `${d.airport} ${typeLabel(d.type)} ${d.start}/${d.duration_min}m`).join(' · ') || 'Baseline'}
                    {x.actions.length > 0 && ` · actions: ${x.actions.map(describeAction).join('; ')}`}
                  </div>
                  <div className="mt-0.5 text-[10px] text-ink-500">Updated {new Date(x.updated_at).toLocaleString()}</div>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="secondary" onClick={() => void s.loadScenario(x)}>
                    Load
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Rename"
                    onClick={() => {
                      setRename(x)
                      setNewName(x.name)
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Duplicate"
                    onClick={() =>
                      void api
                        .duplicateScenario(x.id)
                        .then(s.refreshSaved)
                        .then(() => s.notify('ok', 'Scenario duplicated'))
                    }
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Export JSON"
                    onClick={() => void exp(x.name, { disruptions: x.disruptions, actions: x.actions, settings: x.settings }, 'json')}
                  >
                    <FileJson className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete “${x.name}”?`))
                        void api
                          .deleteScenario(x.id)
                          .then(s.refreshSaved)
                          .then(() => setSelected(selected.filter((i) => i !== x.id)))
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-red-300" />
                  </Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Scenario templates" subtitle="Inputs only — results are computed when loaded" />
          <CardBody className="space-y-2">
            {s.presets.map((p) => (
              <button
                key={p.id}
                onClick={() => void s.loadPreset(p)}
                className="block w-full cursor-pointer rounded-lg border border-ink-700 bg-ink-900 p-2.5 text-left hover:border-sky-accent/50"
              >
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-xs text-ink-400">{p.description}</div>
              </button>
            ))}
          </CardBody>
        </Card>
      </div>

      {cmp && (
        <Card>
          <CardHeader
            icon={<GitCompare className="h-4 w-4" />}
            title="Scenario comparison"
            subtitle="Final state of each scenario (recovered if it has actions), freshly simulated"
          />
          <CardBody className="overflow-x-auto">
            <table className="w-full text-xs" data-testid="scenario-compare-table">
              <thead className="text-ink-400">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Metric</th>
                  {cmp.map((c) => (
                    <th key={c.name} className="px-2 py-1.5 text-right font-medium">
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CMP.map(([k, label]) => (
                  <tr key={k} className="border-t border-ink-800">
                    <td className="px-2 py-1.5 text-ink-300">{label}</td>
                    {cmp.map((c) => (
                      <td key={c.name} className="num px-2 py-1.5 text-right">
                        {n(c.kpis[k] as number)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-ink-800">
                  <td className="px-2 py-1.5 text-ink-300">Network recovery %</td>
                  {cmp.map((c) => (
                    <td key={c.name} className="num px-2 py-1.5 text-right text-emerald-300">
                      {c.recovery !== null ? `${c.recovery}%` : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}

      <Modal open={!!rename} onClose={() => setRename(null)} title="Rename scenario">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoFocus />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRename(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!newName.trim()}
            onClick={() => {
              const r = rename!
              void api
                .updateScenario(r.id, {
                  name: newName.trim(),
                  description: r.description,
                  disruptions: r.disruptions,
                  actions: r.actions,
                  settings: r.settings,
                })
                .then(async () => {
                  if (s.scenario.id === r.id) s.setName(newName.trim())
                  await s.refreshSaved()
                  setRename(null)
                })
                .catch((e) => s.notify('error', (e as Error).message))
            }}
          >
            Rename
          </Button>
        </div>
      </Modal>
    </Page>
  )
}
