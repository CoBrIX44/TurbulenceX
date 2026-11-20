import { FastForward, Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { nextEventTime, prevEventTime, SPEEDS, timelineBounds } from '@/lib/playback'
import { fmt } from '@/lib/time'
import { SEVERITY_COLOR } from '@/lib/labels'
import { selectActive, useSim } from '@/store/useSim'

/** Advances simulated time while playing. `speed` = simulated minutes per real second. */
export function PlaybackTicker() {
  const playing = useSim((s) => s.playing)
  const speed = useSim((s) => s.speed)
  useEffect(() => {
    if (!playing) return
    const step = 100
    const id = window.setInterval(() => {
      const s = useSim.getState()
      const active = selectActive(s)
      if (!active) return
      const [, hi] = timelineBounds(active)
      const next = s.t + (speed * step) / 1000
      if (next >= hi) {
        s.setT(hi)
        s.setPlaying(false)
      } else s.setT(Math.round(next * 10) / 10)
    }, step)
    return () => window.clearInterval(id)
  }, [playing, speed])
  return null
}

export function PlaybackBar({ compact = false }: { compact?: boolean }) {
  const s = useSim()
  const active = selectActive(s)
  const bounds = useMemo(() => (active ? timelineBounds(active) : [300, 1440]), [active])
  if (!active) return null
  const [lo, hi] = bounds
  const t = Math.floor(s.t)
  const markers = active.events.filter((e) => e.severity === 'critical' || e.severity === 'recovery' || e.kind === 'DISRUPTION_START')
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="playback">
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Reset playback"
          title="Reset to start of day"
          onClick={() => {
            s.setPlaying(false)
            s.setT(lo)
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Step backward"
          title="Previous event"
          onClick={() => {
            s.setPlaying(false)
            s.setT(prevEventTime(active.events, t) ?? lo)
          }}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="primary"
          aria-label={s.playing ? 'Pause' : 'Play'}
          data-testid="play-toggle"
          onClick={() => {
            if (!s.playing && t >= hi) s.setT(lo)
            s.setPlaying(!s.playing)
          }}
        >
          {s.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Step forward"
          title="Next event"
          onClick={() => {
            s.setPlaying(false)
            s.setT(nextEventTime(active.events, t) ?? hi)
          }}
        >
          <SkipForward className="h-4 w-4" />
        </Button>
      </div>
      <div className="num w-16 text-center text-sm text-cyan-200">{fmt(t)}</div>
      <div className="relative min-w-[200px] flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5">
          {markers.map((e) => (
            <span
              key={e.event_id}
              className="absolute top-0 h-1.5 w-0.5 rounded"
              style={{ left: `${((e.timestamp - lo) / (hi - lo)) * 100}%`, background: SEVERITY_COLOR[e.severity] }}
            />
          ))}
        </div>
        <input
          type="range"
          aria-label="Simulation time"
          min={lo}
          max={hi}
          step={1}
          value={Math.min(hi, Math.max(lo, t))}
          onChange={(e) => s.setT(Number(e.target.value))}
          className="mt-2 w-full cursor-pointer accent-cyan-400"
        />
        {!compact && (
          <div className="num flex justify-between text-[10px] text-ink-500">
            <span>{fmt(lo)}</span>
            <span>{fmt(Math.round((lo + hi) / 2))}</span>
            <span>{fmt(hi)}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <FastForward className="h-3.5 w-3.5 text-ink-400" />
        <Select aria-label="Playback speed" value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))} className="h-7 w-28 text-xs">
          {SPEEDS.map((v) => (
            <option key={v} value={v}>
              {v} min/s
            </option>
          ))}
        </Select>
      </div>
    </div>
  )
}
