import { Activity, Bot, FlaskConical, History, LayoutDashboard, Map, Plane, Settings, Users, type LucideIcon } from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operations',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/map', label: 'Network Map', icon: Map },
      { to: '/flights', label: 'Flight Operations', icon: Plane },
      { to: '/passengers', label: 'Passenger Impact', icon: Users },
    ],
  },
  {
    title: 'Recovery & Control',
    items: [
      { to: '/simulations', label: 'Simulations', icon: Activity },
      { to: '/dispatcher', label: 'AI Dispatcher', icon: Bot },
      { to: '/recovery', label: 'Recovery Lab', icon: FlaskConical },
    ],
  },
  {
    title: 'System & Records',
    items: [
      { to: '/scenarios', label: 'Scenario History', icon: History },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export const NAV: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items)
