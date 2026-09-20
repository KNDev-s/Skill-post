import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'render', testMatch: 'render.spec.ts', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'desktop',
      testMatch: 'creator.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1100 } },
    },
    {
      name: 'mobile',
      testMatch: 'creator.spec.ts',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' },
    },
    {
      name: 'api',
      testMatch: 'api.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:4174' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -- --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: { VITE_SERVICE_MODE: 'mock' },
    },
    {
      command: 'npm run dev -- --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      env: { VITE_SERVICE_MODE: 'api', VITE_API_BASE_URL: '/api/v1', VITE_POLL_INTERVAL_MS: '100' },
    },
  ],
});
