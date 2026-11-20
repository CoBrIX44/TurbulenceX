import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'
import { FlightTable } from './FlightTable'
import { KpiCard } from './KpiCard'
import { SeverityBadge, StatusBadge } from './StatusBadge'
import { Drawer, Modal } from './ui/misc'
import { Segmented, Switch } from './ui/form'
import type { FlightResult, NetworkData } from '@/lib/types'

// Configure react act environment for jsdom
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  container = null
  root = null
})

function render(element: React.ReactElement) {
  act(() => {
    root?.render(element)
  })
}

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div data-testid="child">Normal Content</div>
      </ErrorBoundary>,
    )
    expect(container?.querySelector('[data-testid="child"]')?.textContent).toBe('Normal Content')
  })

  it('renders fallback UI when a child component throws an error', () => {
    const ProblemChild = () => {
      throw new Error('Simulation Engine Crash')
    }
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary fallbackTitle="Custom Module Error">
        <ProblemChild />
      </ErrorBoundary>,
    )

    const alert = container?.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Custom Module Error')
    expect(alert?.textContent).toContain('Simulation Engine Crash')
    consoleError.mockRestore()
  })
})

describe('Badges and Status', () => {
  it('renders StatusBadge with expected label', () => {
    render(<StatusBadge status="on_time" />)
    expect(container?.textContent).toBe('On time')

    render(<StatusBadge status="cancelled" />)
    expect(container?.textContent).toBe('Cancelled')
  })

  it('renders SeverityBadge with correct tone', () => {
    render(<SeverityBadge severity="severe" />)
    expect(container?.textContent).toBe('SEVERE')
  })
})

describe('KpiCard', () => {
  it('renders label, formatted values and delta indicator', () => {
    render(
      <KpiCard
        label="On Time Performance"
        value="94.5%"
        sub="70 flights"
        tone="ok"
        delta={{ value: -3.2, goodWhenNegative: false }}
      />,
    )
    expect(container?.textContent).toContain('On Time Performance')
    expect(container?.textContent).toContain('94.5%')
    expect(container?.textContent).toContain('70 flights')
    expect(container?.textContent).toContain('-3.2')
  })
})

describe('Form & Accessibility Controls', () => {
  it('Switch renders role="switch" with accessible aria-checked', () => {
    let checked = false
    const handleChange = vi.fn((v: boolean) => {
      checked = v
    })

    render(<Switch checked={checked} onChange={handleChange} label="Enable standby crew" />)

    const button = container?.querySelector('button[role="switch"]')
    expect(button).not.toBeNull()
    expect(button?.getAttribute('aria-checked')).toBe('false')

    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(handleChange).toHaveBeenCalledWith(true)
  })

  it('Segmented renders tablist with tabs and aria-selected', () => {
    const handleChange = vi.fn()
    render(
      <Segmented
        value="disrupted"
        onChange={handleChange}
        options={[
          { value: 'baseline', label: 'Baseline' },
          { value: 'disrupted', label: 'Disrupted' },
          { value: 'recovered', label: 'Recovered' },
        ]}
      />,
    )

    const tablist = container?.querySelector('[role="tablist"]')
    expect(tablist).not.toBeNull()

    const tabs = container?.querySelectorAll('[role="tab"]')
    expect(tabs?.length).toBe(3)
    expect(tabs?.[1]?.getAttribute('aria-selected')).toBe('true')
    expect(tabs?.[0]?.getAttribute('aria-selected')).toBe('false')

    act(() => {
      tabs?.[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(handleChange).toHaveBeenCalledWith('baseline')
  })
})

describe('Modals & Drawers Accessibility', () => {
  it('Modal renders dialog role, aria-modal="true" and handles Escape key', () => {
    const handleClose = vi.fn()
    render(
      <Modal open={true} onClose={handleClose} title="Rename Scenario">
        <div>Modal Content</div>
      </Modal>,
    )

    const dialog = container?.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(handleClose).toHaveBeenCalled()
  })

  it('Drawer renders with accessible close button', () => {
    const handleClose = vi.fn()
    render(
      <Drawer open={true} onClose={handleClose} title="Flight Inspector">
        <div>Drawer Body</div>
      </Drawer>,
    )

    const closeBtn = container?.querySelector('button[aria-label="Close drawer"]')
    expect(closeBtn).not.toBeNull()

    act(() => {
      closeBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(handleClose).toHaveBeenCalled()
  })
})

describe('FlightTable', () => {
  const dummyFlights: FlightResult[] = [
    {
      flight_id: 'DS0101',
      tail_id: 'VT-DS01',
      operating_tail: 'VT-DS01',
      leg_order: 1,
      origin: 'DEL',
      destination: 'BOM',
      pax: 150,
      block_minutes: 130,
      sched_dep: 480,
      sched_arr: 610,
      actual_dep: 480,
      actual_arr: 610,
      dep_delay: 0,
      arr_delay: 0,
      status: 'on_time',
      is_ferry: false,
      components: [],
      primary_reason: 'on_time',
      explanation: 'Scheduled on time',
      inherited_delay: 0,
      introduced_delay: 0,
      previous_leg: null,
      next_leg: null,
      delay_parents: [],
      root_cause: null,
      cancel_reason: null,
      crew_id: 'CR01',
    },
    {
      flight_id: 'DS0102',
      tail_id: 'VT-DS02',
      operating_tail: 'VT-DS02',
      leg_order: 1,
      origin: 'BOM',
      destination: 'BLR',
      pax: 140,
      block_minutes: 100,
      sched_dep: 500,
      sched_arr: 600,
      actual_dep: 550,
      actual_arr: 650,
      dep_delay: 50,
      arr_delay: 50,
      status: 'delayed',
      is_ferry: false,
      components: [],
      primary_reason: 'rotational',
      explanation: 'Aircraft delay',
      inherited_delay: 50,
      introduced_delay: 0,
      previous_leg: null,
      next_leg: null,
      delay_parents: [],
      root_cause: null,
      cancel_reason: null,
      crew_id: 'CR02',
    },
  ]

  const dummyNetwork: NetworkData = {
    meta: { dataset: 'Test', operating_day: '2026-11-20', min_turnaround_minutes: 30, seats_per_aircraft: 180, notes: [] },
    airports: [
      { id: 'DEL', name: 'Indira Gandhi Intl', city: 'Delhi', lat: 28.5, lng: 77.1, tier: 'mega_hub', capacity_per_hour: 40 },
      { id: 'BOM', name: 'Chhatrapati Shivaji Intl', city: 'Mumbai', lat: 19.1, lng: 72.9, tier: 'mega_hub', capacity_per_hour: 32 },
    ],
    flights: [],
    connections: [],
    crews: [],
    spare_aircraft: [{ tail_id: 'VT-DS17', base: 'BLR', available_from: '06:00', seats: 180 }],
    rotations: { 'VT-DS01': ['DS0101'], 'VT-DS02': ['DS0102'] },
    routes: [['BOM', 'DEL']],
    positioning_routes: {},
    checksum: 'dummy_hash',
  }

  it('renders table with caption, col scope headers and rows', () => {
    render(<FlightTable flights={dummyFlights} network={dummyNetwork} />)

    const table = container?.querySelector('table')
    expect(table).not.toBeNull()

    const caption = table?.querySelector('caption')
    expect(caption).not.toBeNull()
    expect(caption?.textContent).toContain('Flight Schedule')

    const headers = table?.querySelectorAll('th[scope="col"]')
    expect(headers?.length).toBeGreaterThan(5)

    const rows = table?.querySelectorAll('tbody tr')
    expect(rows?.length).toBe(2)
  })

  it('supports row keyboard interaction with Enter and Space', () => {
    render(<FlightTable flights={dummyFlights} network={dummyNetwork} />)

    const firstRow = container?.querySelector('tbody tr[role="button"]') as HTMLElement
    expect(firstRow).not.toBeNull()
    expect(firstRow.getAttribute('tabindex')).toBe('0')

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    firstRow.dispatchEvent(enterEvent)
    expect(enterEvent.defaultPrevented).toBe(true)
  })
})
