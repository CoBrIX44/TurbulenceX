import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Suspense, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { FlightInspector } from '@/components/FlightInspector'
import { PlaybackTicker } from '@/components/Playback'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { useSim } from '@/store/useSim'
import { MobileNav, Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function Toast() {
  const toast = useSim((s) => s.toast)
  if (!toast) return null
  const Icon = toast.kind === 'error' ? AlertTriangle : toast.kind === 'ok' ? CheckCircle2 : Info
  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-4 right-4 z-[1200] flex max-w-md items-start gap-2 rounded-lg border px-3.5 py-2.5 text-sm shadow-2xl animate-fade-in',
        toast.kind === 'error'
          ? 'border-crit/50 bg-[#2a0d12] text-red-200'
          : toast.kind === 'ok'
            ? 'border-recover/50 bg-[#062a22] text-emerald-100'
            : 'border-ink-600 bg-ink-850 text-ink-100',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      {toast.text}
    </div>
  )
}

export function AppLayout() {
  const { init, network, bootError, result } = useSim()
  useEffect(() => {
    void init()
  }, [init])
  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav />
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          {bootError ? (
            <div className="mx-auto mt-24 max-w-lg rounded-xl border border-crit/40 bg-crit/5 p-6 text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-red-300" />
              <h2 className="mt-3 font-semibold">Backend unavailable</h2>
              <p className="mt-2 text-sm text-ink-300">{bootError}</p>
              <p className="mt-2 text-xs text-ink-500">Start it with: cd backend &amp;&amp; uvicorn app.main:app --reload --port 8000</p>
              <Button className="mt-4" variant="primary" onClick={() => void init()}>
                Retry
              </Button>
            </div>
          ) : !network || !result ? (
            <div className="flex h-full items-center justify-center gap-3 text-ink-300">
              <Spinner /> Loading flight network and running baseline simulation…
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-64 items-center justify-center gap-2 text-sm text-ink-400">
                  <Spinner /> Loading module…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          )}
        </main>
      </div>
      <FlightInspector />
      <PlaybackTicker />
      <Toast />
    </div>
  )
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 lg:p-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-100">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
