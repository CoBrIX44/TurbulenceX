import { Download } from 'lucide-react'
import { FlightTable } from '@/components/FlightTable'
import { Page } from '@/components/layout/AppLayout'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { api } from '@/lib/api'
import { activeLabel, scenarioInput, selectActive, useSim } from '@/store/useSim'

export function FlightOpsPage() {
  const s = useSim()
  const r = selectActive(s)!
  return (
    <Page
      title="Flight Operations"
      subtitle={`All 70 scheduled flights · ${activeLabel(s)} view · click a flight to inspect its rotation and causal dependencies`}
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => void api.exportScenario(s.scenario.name, scenarioInput(s.scenario), 'csv').catch((e) => s.notify('error', e.message))}
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      }
    >
      <Card>
        <CardBody>
          <FlightTable flights={r.flights} network={s.network!} maxHeight={720} />
        </CardBody>
      </Card>
    </Page>
  )
}
