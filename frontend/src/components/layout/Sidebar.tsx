import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV_SECTIONS, type NavItem } from '@/lib/nav'
import { cn } from '@/lib/utils'
import { useSim } from '@/store/useSim'

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="#0c172c" stroke="#22375e" strokeWidth="1.5" />
        <rect x="6" y="9" width="5.5" height="14" rx="1.5" fill="#22d3ee" transform="rotate(-12 9 16)" />
        <rect x="13" y="9" width="5.5" height="14" rx="1.5" fill="#38bdf8" transform="rotate(10 16 16)" />
        <rect x="20" y="9" width="5.5" height="14" rx="1.5" fill="#f59e0b" transform="rotate(30 23 16)" />
      </svg>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight text-ink-100">
            Domino<span className="text-sky-accent">Sky</span>
          </div>
          <div className="text-[9px] uppercase tracking-[0.2em] font-medium text-ink-400">Flight Ops Center</div>
        </div>
      )}
    </div>
  )
}

function useBadgeCounts(): Record<string, number | undefined> {
  const result = useSim((s) => s.result)
  const counts: Record<string, number | undefined> = {}
  if (result) {
    const k = (result.recovered ?? result.disrupted).kpis
    counts['/flights'] = k.delayed + k.cancelled || undefined
    counts['/passengers'] = k.missed_connections || undefined
  }
  return counts
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const counts = useBadgeCounts()

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        'hidden shrink-0 flex-col border-r border-ink-800 bg-ink-950 transition-all duration-200 md:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-14 items-center justify-between border-b border-ink-800/80 px-3.5">
        <Logo compact={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-ink-700/60 bg-ink-900 text-ink-400 transition-colors hover:border-ink-500 hover:text-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3" aria-label="Operations Navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-1">
            {!collapsed && (
              <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400 select-none">
                {section.title}
              </div>
            )}
            {section.items.map((item) => (
              <SidebarNavLink key={item.to} item={item} collapsed={collapsed} count={counts[item.to]} />
            ))}
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-800/80 p-3">
        {!collapsed ? (
          <div className="text-[10px] leading-relaxed text-ink-400">
            Engine is source of truth. All metrics computed deterministically. Times in IST.
          </div>
        ) : (
          <div className="text-center text-[10px] font-mono text-ink-400" title="Deterministic Engine · IST">
            IST
          </div>
        )}
      </div>
    </aside>
  )
}

function SidebarNavLink({
  item,
  collapsed,
  count,
  onClick,
}: {
  item: NavItem
  collapsed?: boolean
  count?: number
  onClick?: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      className={({ isActive }) =>
        cn(
          'group relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-accent',
          collapsed ? 'justify-center px-0' : '',
          isActive
            ? 'bg-ink-850 font-semibold text-cyan-200 border border-ink-700/80 shadow-sm'
            : 'text-ink-300 hover:bg-ink-900 hover:text-ink-100',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span
              className={cn(
                'absolute bg-sky-accent rounded-full transition-all',
                collapsed ? 'left-1 top-2 bottom-2 w-1' : 'left-0 top-2 bottom-2 w-1',
              )}
              aria-hidden="true"
            />
          )}
          <Icon className={cn('h-4 w-4 shrink-0 transition-colors', isActive ? 'text-sky-accent' : 'text-ink-400 group-hover:text-ink-200')} />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && count ? (
            <span className="num rounded-full bg-warn/15 border border-warn/30 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              {count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const counts = useBadgeCounts()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[1500] md:hidden">
      <div className="absolute inset-0 bg-ink-950/80 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Mobile Navigation"
        className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-ink-700 bg-ink-900 p-4 shadow-2xl animate-slide-in"
      >
        <div className="flex items-center justify-between border-b border-ink-800 pb-3">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-ink-700 bg-ink-850 text-ink-300 hover:text-ink-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto py-4" aria-label="Mobile Navigation Links">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
                {section.title}
              </div>
              {section.items.map((item) => (
                <SidebarNavLink key={item.to} item={item} count={counts[item.to]} onClick={onClose} />
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-ink-800 pt-3 text-[11px] text-ink-400">
          Deterministic simulation engine · IST
        </div>
      </aside>
    </div>
  )
}
