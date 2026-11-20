import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Starts the backend (FastAPI) and the Vite dev server, then runs the essential flows.
// Override commands with E2E_BACKEND_CMD / E2E_FRONTEND_CMD; use PW_CHROMIUM_PATH to point
// at a locally installed Chrome/Chromium if `npx playwright install` is unavailable.
const backendCmd = process.env.E2E_BACKEND_CMD ?? 'cd ../backend && python -m uvicorn app.main:app --port 8000'
const frontendCmd = process.env.E2E_FRONTEND_CMD ?? 'npm run dev -- --port 5173 --strictPort'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    viewport: { width: 1600, height: 1000 },
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1600, height: 1000 } } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: backendCmd,
          url: 'http://127.0.0.1:8000/api/health',
          reuseExistingServer: true,
          timeout: 60_000,
          env: { SCENARIO_STORE_PATH: process.env.SCENARIO_STORE_PATH ?? join(tmpdir(), 'domino-sky-e2e-scenarios.json') },
        },
        { command: frontendCmd, url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 60_000 },
      ],
})
