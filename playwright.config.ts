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
    // Some tests walk through many steps (a fortnight of simulated days, a whole chapter flow); under
    // --repeat-each with 8 workers they need more than the default 30 s. No retries: a flaky test is fixed.
    timeout: 60_000,
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
        // Builds the React app into public/ first, so the tests always run the current code (and public/,
        // which is what gets deployed, is fresh after a test run).
        command: "npm run build:client && node server.js",
        url: `http://localhost:${PORT}/api/health`,
        // Tests run locally only and never spend cloud credits. An empty value wins over .env, because
        // dotenv never overwrites a variable that's already set:
        //  - BLOB_READ_WRITE_TOKEN: no Vercel Blob (account clean-up once used up a month of Blob operations)
        //  - GOOGLE_BOOKS_API_KEY: no searches billed to the real key
        //  - SMTP_*: no real email; reset links are printed to the console instead
        env: {
            PORT: String(PORT),
            BLOB_READ_WRITE_TOKEN: "",
            GOOGLE_BOOKS_API_KEY: "",
            SMTP_HOST: "", SMTP_USER: "", SMTP_PASS: ""
        },
        reuseExistingServer: false,
        timeout: 120_000
    }
});
