import { Activity, Bot, FlaskConical, History, LayoutDashboard, Map, Plane, Settings, Users } from 'lucide-react'

export const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/map', label: 'Network Map', icon: Map },
  { to: '/simulations', label: 'Simulations', icon: Activity },
  { to: '/flights', label: 'Flight Operations', icon: Plane },
  { to: '/passengers', label: 'Passenger Impact', icon: Users },
  { to: '/dispatcher', label: 'AI Dispatcher', icon: Bot },
  { to: '/recovery', label: 'Recovery Lab', icon: FlaskConical },
  { to: '/scenarios', label: 'Scenario History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings },
]
