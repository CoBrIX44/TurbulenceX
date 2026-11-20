import { lazy, type ComponentType } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'

// Route-level code splitting keeps the initial bundle small.
const page = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => loader().then((m) => ({ default: m[name] })))

const OverviewPage = page(() => import('@/pages/Overview'), 'OverviewPage')
const NetworkMapPage = page(() => import('@/pages/NetworkMapPage'), 'NetworkMapPage')
const SimulationsPage = page(() => import('@/pages/Simulations'), 'SimulationsPage')
const FlightOpsPage = page(() => import('@/pages/FlightOps'), 'FlightOpsPage')
const PassengerImpactPage = page(() => import('@/pages/PassengerImpact'), 'PassengerImpactPage')
const DispatcherPage = page(() => import('@/pages/Dispatcher'), 'DispatcherPage')
const RecoveryLabPage = page(() => import('@/pages/RecoveryLab'), 'RecoveryLabPage')
const ScenarioHistoryPage = page(() => import('@/pages/ScenarioHistory'), 'ScenarioHistoryPage')
const SettingsPage = page(() => import('@/pages/Settings'), 'SettingsPage')

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="map" element={<NetworkMapPage />} />
          <Route path="simulations" element={<SimulationsPage />} />
          <Route path="flights" element={<FlightOpsPage />} />
          <Route path="passengers" element={<PassengerImpactPage />} />
          <Route path="dispatcher" element={<DispatcherPage />} />
          <Route path="recovery" element={<RecoveryLabPage />} />
          <Route path="scenarios" element={<ScenarioHistoryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<OverviewPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
