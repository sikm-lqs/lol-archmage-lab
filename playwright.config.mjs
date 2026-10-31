import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './artifacts/test-results',
  reporter: 'list',
  workers: 2,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
  },
  webServer: [
    {
      command: 'npm run build && npm run preview -- --port 5180',
      url: 'http://127.0.0.1:5180',
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: 'npm run preview -- --port 5181 --base /lol-archmage',
      url: 'http://127.0.0.1:5181/lol-archmage/',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
