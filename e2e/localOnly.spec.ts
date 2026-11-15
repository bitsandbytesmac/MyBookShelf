import { test, expect, today } from "./fixtures";

// Guard: tests run on this machine only. The browser never reaches anything but the local test server
// (fixtures.ts blocks the rest), and the test server runs with every cloud credential blanked
// (playwright.config.ts; noBlob.spec.ts checks the Blob part through the API).
test.describe("Testing stays local", () => {
    test("the browser can't reach outside sites", async ({ page, account }) => {
        void account;
        await page.goto("/index.html#/dashboard");
        const reached = await page.evaluate(async () => {
            try {
                await fetch("https://fonts.googleapis.com/css2?family=Fraunces", { mode: "no-cors" });
                return true;
            } catch {
                return false;
            }
        });
        expect(reached, "A test browser reached an outside site").toBe(false);
    });

    test("every page loads with only local requests", async ({ page, api }) => {
        const outside: string[] = [];
        page.on("requestfinished", (request) => {
            const { protocol, hostname } = new URL(request.url());
            if ((protocol === "http:" || protocol === "https:") && !["localhost", "127.0.0.1", "[::1]"].includes(hostname)) outside.push(request.url());
        });

        const book = await api.createBook({ title: "Local Only", status: "Reading", totalPages: 100, currentPage: 10, series: "Local Saga", seriesNumber: 1 });
        const r = await page.request.put(`/api/books/${book.id}`, {
            data: { title: book.title, author: "A", status: "Reading", totalPages: 100, currentPage: 20, genres: [], subgenres: [], quotes: ["A line."], sessionDate: today(), series: "Local Saga", seriesNumber: 1 }
        });
        expect(r.ok()).toBeTruthy();

        for (const route of ["dashboard", "library", `book/${book.id}`, "authors", "series", "statistics", "challenges"]) {
            await page.goto(`/index.html?v=${encodeURIComponent(route)}#/${route}`);
            await expect(page.locator("#view")).not.toBeEmpty();
            await page.waitForLoadState("networkidle");
        }
        for (const path of ["/login.html", "/register.html", "/forgot-password.html", "/privacy.html", "/terms.html"]) {
            await page.goto(path);
            await page.waitForLoadState("networkidle");
        }
        expect(outside, "Requests that left this machine").toEqual([]);
    });
});
