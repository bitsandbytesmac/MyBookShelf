import { test, expect } from "./fixtures";

// No page may scroll sideways at any common screen width, even with very long titles and names.
// (The top bar once stopped fitting between 641 and 1365px when a seventh tab arrived; see the
// "Navigation by screen width" section of style.css.)
const WIDTHS: [number, number][] = [[320, 568], [768, 1024], [1024, 768], [1240, 800], [1366, 768]];
const LONG = "Supercalifragilisticexpialidociouslylongunbrokenword";

for (const [width, height] of WIDTHS) {
    test.describe(`${width}px wide`, () => {
        test.use({ viewport: { width, height } });

        test("pages fit the screen and the nav stays on one row", async ({ page, api }) => {
            const book = await api.createBook({
                title: `A Very Long Title ${LONG}`, author: `Anastasia ${LONG}`, status: "Reading", totalPages: 300, currentPage: 30,
                series: `The ${LONG} Saga`, seriesNumber: 1, genres: ["Fantasy"]
            });
            const routes = ["#/dashboard", "#/library", `#/book/${book.id}`, "#/physical", "#/authors", `#/author/${encodeURIComponent(`Anastasia ${LONG}`)}`,
                "#/series", `#/series/${encodeURIComponent(`The ${LONG} Saga`)}`, "#/statistics", "#/challenges"];
            for (const route of routes) {
                await page.goto(`/index.html?v=${Date.now()}${route}`);
                await expect(page.locator("#view > *").first()).toBeVisible();
                await expect(page.locator(".skeleton")).toHaveCount(0);
                const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
                expect(sideways, `sideways scroll on ${route}`).toBeLessThanOrEqual(0);
            }
            // The Library's grid view too (long titles are clamped inside their tiles).
            await page.goto(`/index.html?v=grid#/library`);
            await page.getByRole("button", { name: "Grid" }).click();
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

            // Every tab is on screen, on one row.
            const tabs = page.locator("nav.tabs .tab");
            await expect(tabs).toHaveCount(7);
            const boxes = await tabs.evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ left: r.left, right: r.right, top: r.top })));
            for (const b of boxes) {
                expect(b.left).toBeGreaterThanOrEqual(0);
                expect(b.right).toBeLessThanOrEqual(width + 0.5);
                expect(Math.abs(b.top - boxes[0].top)).toBeLessThan(2);
            }
        });
    });
}
