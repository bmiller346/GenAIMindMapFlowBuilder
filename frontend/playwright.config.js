import { defineConfig, devices } from '@playwright/test';

const devServerPort = process.env.PLAYWRIGHT_DEV_PORT || '5173';
const devServerUrl = `http://127.0.0.1:${devServerPort}`;

export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30000,
    expect: {
        timeout: 7000
    },
    use: {
        baseURL: devServerUrl,
        trace: 'retain-on-failure'
    },
    webServer: {
        command: `npm run dev -- --host 127.0.0.1 --port ${devServerPort}`,
        url: devServerUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120000
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
    ]
});
