import { test, expect } from "./fixtures";
import type { Page, BrowserContext } from "@playwright/test";

const quoteCard = (page: Page) => page.locator("section.dash-quote");
// Going to the same URL with only a #hash is a same-page jump, not a reload, so every visit gets its own query.
let visits = 0;
const openDashboard = (page: Page) => page.goto(`/index.html?v=${++visits}#/dashboard`);
const shown = (page: Page) => quoteCard(page).locator("blockquote");

async function addQuote(page: Page, title: string, quote: string) {
    const r = await page.request.post("/api/books", { data: { title, author: "Poet", status: "Read", genres: [], subgenres: [], quotes: [quote] } });
    expect(r.ok(), await r.text()).toBeTruthy();
}

async function seed(page: Page, n: number) {
    for (let i = 1; i <= n; i++) await addQuote(page, `Book ${i}`, `Lovely line number ${i}.`);
}

// A second signed-in session (fresh localStorage), optionally in another time zone.
async function newSession(page: Page, browserContext: BrowserContext, timezoneId?: string) {
    const { cookies } = await browserContext.storageState();
    const browser = browserContext.browser()!;
    if (page.url() === "about:blank") await openDashboard(page);
    const user = await page.evaluate(() => localStorage.getItem("user"));
    const ctx = await browser.newContext({ baseURL: "http://localhost:3210", timezoneId, storageState: { cookies, origins: [] } });
    await ctx.addInitScript((u) => localStorage.setItem("user", u!), user);
    return ctx;
}

test.describe("Quote of the Day", () => {
    test("stays the same all day: reloads and a new session show the same quote", async ({ page, api, context }) => {
        void api;
        await seed(page, 6);
        await page.clock.setFixedTime(new Date("2026-11-16T09:00:00"));
        await openDashboard(page);
        const first = await shown(page).textContent();
        expect(first).toMatch(/^Lovely line number \d\.$/);

        await page.clock.setFixedTime(new Date("2026-11-16T21:30:00"));
        for (let i = 0; i < 3; i++) {
            await page.reload();
            await expect(shown(page)).toHaveText(first!);
        }

        const other = await newSession(page, context);
        try {
            const page2 = await other.newPage();
            await page2.clock.setFixedTime(new Date("2026-11-16T23:59:00"));
            await openDashboard(page2);
            await expect(shown(page2)).toHaveText(first!);
        } finally {
            await other.close();
        }
    });

    test("adding or removing a quote during the day doesn't change today's quote", async ({ page, api }) => {
        void api;
        await seed(page, 3);
        // Several days in a row, so it can't pass by luck on one date.
        for (let day = 10; day <= 16; day++) {
            await page.clock.setFixedTime(new Date(`2026-11-${day}T10:00:00`));
            await openDashboard(page);
            const today = await shown(page).textContent();
            await addQuote(page, `Added on the ${day}th`, `A line added on the ${day}th.`);
            await page.reload();
            await expect(shown(page), `day ${day}`).toHaveText(today!);
        }
    });

    test("a new, different quote each day, picked at random rather than in a fixed order", async ({ page, api }) => {
        void api;
        await seed(page, 8);
        const picks: string[] = [];
        for (let day = 1; day <= 20; day++) {
            await page.clock.setFixedTime(new Date(`2026-12-${String(day).padStart(2, "0")}T12:00:00`));
            await openDashboard(page);
            picks.push((await shown(page).textContent())!);
        }
        // Never the same quote two days running.
        for (let i = 1; i < picks.length; i++) expect(picks[i], `Dec ${i + 1}`).not.toBe(picks[i - 1]);
        // Not just walking through the list in order.
        const order = picks.map((p) => Number(p.match(/\d+/)![0]));
        const stepsOfOne = order.slice(1).filter((n, i) => n === (order[i] % 8) + 1).length;
        expect(stepsOfOne).toBeLessThan(10);
        expect(new Set(picks).size).toBeGreaterThan(3);
    });

    test("changes by itself at local midnight, without reloading", async ({ page, api }) => {
        void api;
        await seed(page, 5);
        await page.clock.install({ time: new Date("2026-11-16T23:58:00") });
        await openDashboard(page);
        const before = await shown(page).textContent();
        await page.clock.fastForward("05:00"); // to 00:03 on the 17th
        await expect(shown(page)).not.toHaveText(before!);
    });

    test("the day follows the reader's own time zone", async ({ page, api, context }) => {
        void api;
        await seed(page, 6);
        // 16:30 UTC on the 16th is already 00:30 on the 17th in Manila (UTC+8).
        const manila = await newSession(page, context, "Asia/Manila");
        const utc = await newSession(page, context, "UTC");
        try {
            const m = await manila.newPage();
            await m.clock.setFixedTime(new Date("2026-11-16T16:30:00Z"));
            await openDashboard(m);
            const u = await utc.newPage();
            await u.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
            await openDashboard(u);
            await expect(shown(m)).toHaveText((await shown(u).textContent())!);
        } finally {
            await manila.close();
            await utc.close();
        }
    });
});
