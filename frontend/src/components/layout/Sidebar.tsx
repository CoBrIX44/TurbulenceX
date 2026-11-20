import { NavLink } from 'react-router-dom'
import { useSim } from '@/store/useSim'
import { NAV } from '@/lib/nav'
import { cn } from '@/lib/utils'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill="#0f1d35" stroke="#22375e" />
        <rect x="6" y="9" width="5.5" height="14" rx="1.5" fill="#22d3ee" transform="rotate(-12 9 16)" />
        <rect x="13" y="9" width="5.5" height="14" rx="1.5" fill="#38bdf8" transform="rotate(10 16 16)" />
        <rect x="20" y="9" width="5.5" height="14" rx="1.5" fill="#f59e0b" transform="rotate(30 23 16)" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-ink-100">
            Domino<span className="text-sky-accent">Sky</span>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400">Ops Control</div>
        </div>
      )}
    </div>
  )
}

export function Sidebar() {
  const result = useSim((s) => s.result)
  const counts: Record<string, number | undefined> = {}
  if (result) {
    const k = (result.recovered ?? result.disrupted).kpis
    counts['/flights'] = k.delayed + k.cancelled || undefined
    counts['/passengers'] = k.missed_connections || undefined
  }
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-700/80 bg-ink-900/80 md:flex">
      <div className="flex h-14 items-center border-b border-ink-700/80 px-4">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive ? 'bg-sky-accent/10 text-cyan-100 shadow-[inset_2px_0_0_0_#22d3ee]' : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {counts[to] ? <span className="num rounded bg-warn/15 px-1.5 text-[10px] text-amber-300">{counts[to]}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-ink-700/80 p-3 text-[10px] leading-relaxed text-ink-500">
        All operational figures are computed by the deterministic simulation engine. Times in IST.
      </div>
    </aside>
  )
}

export function MobileNav() {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-ink-700 bg-ink-900 px-2 py-1.5 md:hidden" aria-label="Main mobile">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn('flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs', isActive ? 'bg-sky-accent/10 text-cyan-100' : 'text-ink-300')
          }
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
