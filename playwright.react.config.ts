import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// The same tests, run against the React build (client/dist) instead of public/.
// Same local-only rules: local database, every cloud credential blanked, outside requests blocked.
// The tests that pass here show how far the migration has got.
export default defineConfig({
    ...base,
    outputDir: "test-results-react",
    reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-react" }]],
    webServer: {
        ...base.webServer,
        command: "npm run build:client && node server.js",
        env: { ...(base.webServer as { env: Record<string, string> }).env, STATIC_DIR: "client/dist" },
        timeout: 120_000
    }
});
