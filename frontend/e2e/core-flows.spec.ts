import { expect, test } from '@playwright/test'

test.describe('Domino Sky essential flows', () => {
  test('overview shows the real 70-flight baseline network', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('kpis')).toContainText('Scheduled flights')
    await expect(page.getByTestId('kpis')).toContainText('70')
    await expect(page.getByTestId('network-status')).toContainText('100% OTP')
    await expect(page.getByTestId('network-map')).toBeVisible()
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible()
  })

  test('configure a 90-minute BOM closure and trace the cascade', async ({ page }) => {
    await page.goto('/simulations')
    await page.getByTestId('dis-airport').selectOption('BOM')
    await page.getByTestId('dis-type').selectOption('airport_closure')
    await page.getByTestId('dis-start').fill('08:00')
    await page.getByTestId('dis-duration').fill('90')
    await page.getByTestId('dis-submit').click()
    await expect(page.getByTestId('disruption-D1')).toContainText('BOM')
    await page.getByTestId('panel-run').click()
    await expect(page.getByTestId('network-status')).toContainText('87.1% OTP')

    await page.getByRole('link', { name: 'Flight Operations' }).click()
    await page.getByTestId('status-filter').selectOption('delayed')
    await expect(page.getByTestId('flight-count')).toContainText('9 of 70')
    await expect(page.getByTestId('row-DS0501')).toContainText('75m')
    await page.getByTestId('row-DS0502').click()
    await expect(page.getByTestId('flight-inspector')).toContainText('arrived late from DS0501')
    await expect(page.getByTestId('causal-graph')).toBeVisible()
    await page.keyboard.press('Escape')

    await page.getByRole('link', { name: 'Passenger Impact' }).click()
    await expect(page.getByTestId('connections-table')).toContainText('CX05')
    await expect(page.getByTestId('pax-kpis')).toContainText('48')
  })

  test('invalid disruption input is blocked', async ({ page }) => {
    await page.goto('/simulations')
    await page.getByTestId('dis-airport').selectOption('BOM')
    await page.getByTestId('dis-start').fill('25:99')
    await page.getByTestId('dis-submit').click()
    await expect(page.getByTestId('disruption-form')).toContainText('Use 24-hour HH:MM')
  })

  test('dispatcher recommends, recovery lab applies and compares', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('quick-bom-thunderstorm-90').click()
    await expect(page.getByTestId('network-status')).toContainText('87.1% OTP')
    await page.getByRole('link', { name: 'AI Dispatcher' }).click()
    await page.getByTestId('ask-dispatcher').click()
    await expect(page.getByTestId('dispatcher-source')).toBeVisible()
    await expect(page.getByTestId('rec-1')).toContainText('Deploy VT-DS18')
    await page.getByTestId('rec-1-apply').click()
    await expect(page.getByTestId('rec-1-apply')).toHaveText('Applied')

    await page.getByRole('link', { name: 'Recovery Lab' }).click()
    await expect(page.getByTestId('applied-actions')).toContainText('VT-DS18')
    await expect(page.getByTestId('recovery-pct')).not.toHaveText('—')
    await expect(page.getByTestId('comparison-table')).toContainText('Total delay minutes')

    // manual spare deployment with feasibility check
    await page.getByTestId('replace-tail').selectOption('VT-DS05')
    await page.getByTestId('from-flight').selectOption('DS0502')
    await page.getByTestId('check-feasibility').click()
    await expect(page.getByTestId('feasibility-preview')).toContainText('Engine-computed impact')
    await page.getByTestId('preview-apply').click()
    await expect(page.getByTestId('applied-actions')).toContainText('VT-DS17')
    await page.getByTestId('undo-action').click()
    await expect(page.getByTestId('applied-actions')).not.toContainText('VT-DS17')
  })

  test('save scenario and find it in history', async ({ page }) => {
    await page.goto('/scenarios')
    await page.getByTestId('scenario-name').fill(`E2E scenario ${Date.now()}`)
    await page.getByTestId('save-scenario').click()
    await expect(page.getByTestId('saved-list')).toContainText('E2E scenario')
  })

  test('playback controls move simulated time', async ({ page }) => {
    await page.goto('/simulations')
    const clock = page.getByTestId('sim-clock')
    const before = await clock.textContent()
    await page.getByRole('button', { name: 'Step forward' }).click()
    await expect(clock).not.toHaveText(before ?? '')
  })
})
