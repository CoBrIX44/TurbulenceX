/** Engine time: integer minutes from midnight IST; >= 1440 means next day. */
export const DAY = 1440

export function fmt(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  const day = Math.floor(min / DAY)
  const rem = ((min % DAY) + DAY) % DAY
  const s = `${String(Math.floor(rem / 60)).padStart(2, '0')}:${String(rem % 60).padStart(2, '0')}`
  return day > 0 ? `${s} +${day}` : s
}

export function parseHHMM(v: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

export function fmtDelay(min: number): string {
  if (min <= 0) return '0m'
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}
