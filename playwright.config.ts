import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// The tests create and delete throwaway accounts. Make sure the server they start uses the
// local database, never Neon (the server reads .env too, so check both places).
dotenv.config({ quiet: true });
if (process.env.DATABASE_URL) {
    throw new Error("E2E tests must run against the local database. Unset DATABASE_URL (shell and .env) first.");
}

const PORT = 3210;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: `http://localhost:${PORT}`,
        trace: "retain-on-failure",
        screenshot: "only-on-failure"
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
        { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ }
    ],
    webServer: {
        command: "node server.js",
        url: `http://localhost:${PORT}/api/health`,
        env: { PORT: String(PORT) },
        reuseExistingServer: false,
        timeout: 30_000
    }
});
