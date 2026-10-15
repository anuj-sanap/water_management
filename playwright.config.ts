import { defineConfig } from '@playwright/test';

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: externalBaseUrl ?? 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
        url: 'http://127.0.0.1:3100/login',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
