import { test, expect, expectToast, dialog } from "./fixtures";
import type { Page } from "@playwright/test";

// Log your reading's checks, the empty dashboard, and the midnight redraw. Runs against the vanilla app
// and the React build.

async function addQuoteBook(page: Page, title: string, quote: string) {
    const r = await page.request.post("/api/books", { data: { title, author: "Poet", status: "Read", genres: [], subgenres: [], quotes: [quote] } });
    expect(r.ok(), await r.text()).toBeTruthy();
}

test.describe("Journal and dashboard", () => {
    test("Log your reading checks the entry before saving; a note alone is an entry too", async ({ page, api }) => {
        const book = await api.createBook({ title: "Slow Read", status: "Reading", totalPages: 100, currentPage: 10 });
        await page.goto(`/index.html?v=${Date.now()}#/book/${book.id}`);
        // The button on the book's progress card (the top bar's one says "still loading" until the shelf is in).
        await page.locator(".session-log").click();

        const log = dialog(page, "Log your reading");
        await expect(log.getByLabel("Notes")).toBeFocused();
        const save = log.getByRole("button", { name: "Save to journal" });

        await save.click();
        await expect(log.locator(".form-error")).toHaveText("Move your page on or write a note to save an entry.");

        await log.getByLabel("Page I'm on").fill("150");
        await save.click();
        await expect(log.locator(".form-error")).toHaveText("This book has 100 pages.");

        await log.getByLabel("Page I'm on").fill("10");
        await log.getByLabel("Date").fill("2999-01-01");
        await save.click();
        await expect(log.locator(".form-error")).toHaveText("The date can't be in the future.");

        // The stepper moves one page and never past the end.
        await log.getByLabel("Date").fill(new Date().toLocaleDateString("en-CA"));
        await log.getByRole("button", { name: "One page forward" }).click();
        await expect(log.getByLabel("Page I'm on")).toHaveValue("11");
        await expect(log.locator(".log-preview")).toHaveText("11% · +1 page today");
        await log.getByRole("button", { name: "One page back" }).click();
        await expect(log.locator(".log-preview")).toHaveText("10%");

        await log.getByLabel("Notes").fill("Just thinking about chapter two.");
        await save.click();
        await expectToast(page, "Saved to your journal");
        await expect(page.locator(".sessions li").first()).toContainText("Note");
        await expect(page.locator(".sessions li").first()).toContainText("Just thinking about chapter two.");

        await page.goto(`/index.html?v=${Date.now()}#/dashboard`);
        await expect(page.locator(".dash-entries .entry").first()).toContainText("Journal note");
        await expect(page.locator(".streak-pill strong")).toHaveText("1");
    });

    test("an empty shelf shows a welcome with Add your first book", async ({ page, account }) => {
        await page.goto("/index.html#/dashboard");
        await expect(page.getByRole("heading", { level: 1 })).toContainText(account.username);
        await expect(page.getByText("Your shelf is waiting for its first book.")).toBeVisible();
        await page.getByRole("button", { name: "Add your first book" }).click();
        await expect(dialog(page, /^Add a book$/)).toBeVisible();
    });

    test("the midnight redraw waits while a dialog is open", async ({ page, api }) => {
        void api;
        for (let i = 1; i <= 5; i++) await addQuoteBook(page, `Book ${i}`, `Lovely line number ${i}.`);
        await page.clock.install({ time: new Date("2026-11-16T23:58:00") });
        await page.goto(`/index.html?v=${Date.now()}#/dashboard`);
        const quote = page.locator("section.dash-quote blockquote");
        const before = await quote.textContent();

        // A dialog is open over the dashboard at midnight: nothing behind it changes.
        await page.getByRole("button", { name: "Customize colours" }).click();
        const look = dialog(page, "Customize your shelf");
        await expect(look).toBeVisible();
        await page.clock.fastForward("05:00"); // to 00:03 on the 17th
        await expect(look).toBeVisible();
        await expect(quote).toHaveText(before!);

        // Once it's closed, the next check redraws with the new day's quote.
        await look.getByRole("button", { name: "Cancel" }).click();
        await page.clock.fastForward("00:31");
        await expect(quote).not.toHaveText(before!);
    });
});
