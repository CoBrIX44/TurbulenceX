import { Badge, type Tone } from '@/components/ui/badge'
import { STATUS_LABEL } from '@/lib/labels'
import type { FlightStatus } from '@/lib/types'

const TONE: Record<FlightStatus, Tone> = { on_time: 'ok', delayed: 'warn', severe: 'crit', cancelled: 'muted' }

export function StatusBadge({ status }: { status: FlightStatus }) {
  return <Badge tone={TONE[status]}>{STATUS_LABEL[status]}</Badge>
}

export function SeverityBadge({ severity }: { severity: 'normal' | 'minor' | 'moderate' | 'severe' }) {
  const tone: Record<string, Tone> = { normal: 'ok', minor: 'cyan', moderate: 'warn', severe: 'crit' }
  return <Badge tone={tone[severity]}>{severity.toUpperCase()}</Badge>
}
