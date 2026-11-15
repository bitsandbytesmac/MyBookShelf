import { test, expect, today } from "./fixtures";
import type { Page } from "@playwright/test";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return ymd(d); };
const lastOfPrevMonth = () => { const d = new Date(); d.setDate(0); return ymd(d); };
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };

// A journal entry saved straight through the API (the PUT is a full replacement, so send the whole book).
async function logViaApi(page: Page, book: { id: string; title: string }, currentPage: number, sessionDate: string | null, extra: Record<string, unknown> = {}) {
    const response = await page.request.put(`/api/books/${book.id}`, {
        data: { title: book.title, author: "Test Author", status: "Reading", totalPages: 300, currentPage, genres: [], subgenres: [], quotes: [], sessionDate, ...extra }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
}

const recap = (page: Page) => page.locator("section.recap");
const dayButton = (page: Page, date: string) => recap(page).locator(`button[data-focus="day-${date}"]`);

test.describe("Reading Recap", () => {
    test("marks the days you read this month and shows what you read on the day you pick", async ({ page, api }) => {
        test.skip(new Date().getDate() === 1, "needs two different days in this month");
        const a = await api.createBook({ title: "Morning Book", author: "Ava Writer", status: "Reading", totalPages: 300, currentPage: 10 });
        const b = await api.createBook({ title: "Early Month Book", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, b, 60, firstOfMonth());
        await logViaApi(page, a, 30, today(), { sessionNote: "Loved chapter two", author: "Ava Writer" });

        await page.goto("/index.html#/statistics");
        await expect(recap(page).getByRole("heading", { name: "Reading Recap" })).toBeVisible();
        // Charts are still there.
        await expect(page.getByRole("heading", { name: "Books read" })).toBeVisible();

        await expect(recap(page).locator(".recap-day.is-read")).toHaveCount(2);
        await expect(dayButton(page, today())).toHaveClass(/is-read/);
        await expect(dayButton(page, firstOfMonth())).toHaveClass(/is-read/);
        await expect(recap(page).locator(".recap-summary")).toHaveText("Read on 2 days · 70 pages");

        // The latest day is picked to start with.
        await expect(dayButton(page, today())).toHaveAttribute("aria-pressed", "true");
        const panel = recap(page).locator(".recap-day-panel");
        const entry = panel.locator(".recap-entry");
        await expect(entry).toHaveCount(1);
        await expect(entry.locator(".recap-title")).toHaveText("Morning Book");
        await expect(entry.locator(".recap-author")).toHaveText("Ava Writer");
        await expect(entry.locator(".recap-progress")).toHaveText("+20 pages · p. 10 → 30 of 300 (10%)");
        await expect(entry.locator(".recap-note")).toHaveText("Loved chapter two");
        await expect(entry.locator(".recap-when")).toContainText("Logged at");
        await expect(entry.locator(".cover")).toHaveCount(1);

        await dayButton(page, firstOfMonth()).click();
        await expect(dayButton(page, firstOfMonth())).toHaveAttribute("aria-pressed", "true");
        await expect(dayButton(page, firstOfMonth())).toBeFocused();
        await expect(entry.locator(".recap-title")).toHaveText("Early Month Book");
        await expect(entry.locator(".recap-progress")).toContainText("+50 pages · p. 10 → 60");
        // Logged today for an earlier day: says when it was written, not a misleading time.
        await expect(entry.locator(".recap-when")).toHaveText(/^Logged on /);

        await entry.getByRole("link", { name: "Early Month Book" }).click();
        await expect(page).toHaveURL(new RegExp(`#/book/${b.id}$`));
    });

    test("a day without reading says so, and future days can't be picked", async ({ page, api }) => {
        test.skip(new Date().getDate() === 1, "needs an earlier day in this month");
        const book = await api.createBook({ title: "Only Today", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, book, 20, today());

        await page.goto("/index.html#/statistics");
        await dayButton(page, firstOfMonth()).click();
        await expect(recap(page).locator(".recap-day-panel")).toContainText("No reading logged on this day.");
        await expect(recap(page).locator(".recap-day.is-future button, button.is-future")).toHaveCount(0);
        await expect(recap(page).getByRole("button", { name: "Next month" })).toBeDisabled();
    });

    test("moves between months, back to the first month you logged", async ({ page, api }) => {
        const book = await api.createBook({ title: "Long Read", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, book, 40, lastOfPrevMonth());
        await logViaApi(page, book, 50, today());

        await page.goto("/index.html#/statistics");
        const prev = recap(page).getByRole("button", { name: "Previous month" });
        const next = recap(page).getByRole("button", { name: "Next month" });
        await expect(next).toBeDisabled();
        await expect(prev).toBeEnabled();

        await prev.click();
        const label = new Date(`${lastOfPrevMonth()}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
        await expect(recap(page).locator(".recap-month")).toHaveText(label);
        // This is the first month with entries, so the arrow just pressed is disabled; focus moves to the other one.
        await expect(next).toBeFocused();
        await expect(dayButton(page, lastOfPrevMonth())).toHaveClass(/is-read/);
        await expect(dayButton(page, lastOfPrevMonth())).toHaveAttribute("aria-pressed", "true");
        await expect(recap(page).locator(".recap-entry .recap-progress")).toHaveText("+30 pages · p. 10 → 40 of 300 (13%)");
        // Nothing logged before this month.
        await expect(prev).toBeDisabled();

        await next.click();
        await expect(dayButton(page, today())).toHaveClass(/is-read/);
        await expect(next).toBeDisabled();
    });

    test("uses the same days as the streak and highlights the current run", async ({ page, api }) => {
        const book = await api.createBook({ title: "Streaky", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, book, 20, daysAgo(3));
        await logViaApi(page, book, 30, daysAgo(1));
        await logViaApi(page, book, 40, today());

        await page.goto("/index.html#/statistics");
        await expect(page.locator(".stat-tile").nth(3).locator(".dash-stat-value")).toHaveText("2");
        await expect(dayButton(page, today())).toHaveClass(/is-streak/);
        await expect(dayButton(page, daysAgo(1))).toHaveClass(/is-streak/);

        const stats = (await (await page.request.get(`/api/activities/statistics?today=${today()}`)).json()).data;
        const month = today().slice(0, 7);
        const recapDays = (await (await page.request.get(`/api/activities/recap?month=${month}`)).json()).data.days.map((d: { date: string }) => d.date);
        expect(recapDays).toEqual(stats.readingDays.filter((d: string) => d.startsWith(month)).sort());
        // daysAgo(3) is read but the gap on daysAgo(2) ends the streak.
        if (daysAgo(3).startsWith(month)) {
            await expect(dayButton(page, daysAgo(3))).toHaveClass(/is-read/);
            await expect(dayButton(page, daysAgo(3))).not.toHaveClass(/is-streak/);
        }
    });

    test("past entries keep their pages when the book's progress changes later", async ({ page, api }) => {
        const book = await api.createBook({ title: "Changing", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, book, 25, daysAgo(2));
        await logViaApi(page, book, 120, null); // a later update from the book page
        await logViaApi(page, book, 5, null);   // and a correction downwards (logs nothing)

        const day = (await (await page.request.get(`/api/activities/recap/${daysAgo(2)}`)).json()).data;
        expect(day.entries).toHaveLength(1);
        expect(day.entries[0]).toMatchObject({ previousPage: 10, currentPage: 25, pagesRead: 15, title: "Changing", totalPages: 300 });
    });

    test("an entry without a picked date lands on the reader's own today", async ({ page, api }) => {
        const book = await api.createBook({ title: "Time Zones", status: "Reading", totalPages: 300, currentPage: 10 });
        // A reader ahead of UTC: their date is the server's tomorrow. Accepted (within a day).
        const ahead = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        await logViaApi(page, book, 20, null, { localDate: ahead });
        let day = (await (await page.request.get(`/api/activities/recap/${ahead}`)).json()).data;
        expect(day.entries).toHaveLength(1);

        // An implausible date is ignored; the server's own date is used.
        await logViaApi(page, book, 30, null, { localDate: "2001-01-01" });
        day = (await (await page.request.get("/api/activities/recap/2001-01-01")).json()).data;
        expect(day.entries).toHaveLength(0);
    });

    test("validates the month and date, and only ever shows your own reading", async ({ page, api, playwright, baseURL }) => {
        for (const bad of ["2026-13", "2026-1", "nope", ""]) {
            const r = await page.request.get(`/api/activities/recap?month=${bad}`);
            expect(r.status(), bad).toBe(400);
        }
        for (const bad of ["2026-02-30", "2026-1-01", "yesterday"]) {
            const r = await page.request.get(`/api/activities/recap/${bad}`);
            expect(r.status(), bad).toBe(400);
        }
        const empty = (await (await page.request.get("/api/activities/recap?month=1999-01")).json()).data;
        expect(empty).toMatchObject({ month: "1999-01", days: [], totals: { days: 0, entries: 0, pages: 0 } });

        const book = await api.createBook({ title: "Private Diary", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, book, 20, today());

        // Someone else, signed in separately, sees nothing of it.
        const other = await playwright.request.newContext({ baseURL });
        const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        const account = { username: `E2E Other ${stamp}`, email: `e2e${stamp}@example.test`, password: "E2e-test-pass-123" };
        try {
            expect((await other.post("/api/auth/register", { data: account })).ok()).toBeTruthy();
            expect((await other.post("/api/auth/login", { data: { email: account.email, password: account.password } })).ok()).toBeTruthy();
            const theirs = (await (await other.get(`/api/activities/recap/${today()}`)).json()).data;
            expect(theirs.entries).toEqual([]);
            const theirMonth = (await (await other.get(`/api/activities/recap?month=${today().slice(0, 7)}`)).json()).data;
            expect(theirMonth.days).toEqual([]);
            expect(theirMonth.firstDate).toBeNull();
        } finally {
            await other.delete("/api/auth/account", { data: { password: account.password } });
            await other.dispose();
        }

        const unauthenticated = await playwright.request.newContext({ baseURL });
        expect((await unauthenticated.get(`/api/activities/recap/${today()}`)).status()).toBe(401);
        await unauthenticated.dispose();
    });
});
