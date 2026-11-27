import { test, expect, expectToast, dialog, blockExternal } from "./fixtures";
import type { Page } from "@playwright/test";

// Journal notes on the book page (Reading progress): a note opens in full when clicked, with Edit and
// Delete. Deleting the note of an entry that also logged pages keeps the pages; a note-only entry goes.

const LONG_NOTE = "Chapter one was slow, but then the storm hit the harbour and everything changed. ".repeat(6).trim();

async function logEntry(page: Page, bookId: string, currentPage: number, note: string) {
    const r = await page.request.put(`/api/books/${bookId}`, {
        data: { title: "Storm Harbour", author: "Test Author", status: "Reading", totalPages: 100, currentPage, genres: [], subgenres: [], quotes: [], sessionNote: note }
    });
    expect(r.ok(), await r.text()).toBeTruthy();
}

const entries = (page: Page) => page.locator("ul.sessions > li");

test.describe("Journal notes on the book page", () => {
    test("a note opens in full when clicked, and can be edited and deleted", async ({ page, api }) => {
        const book = await api.createBook({ title: "Storm Harbour", status: "Reading", totalPages: 100, currentPage: 10 });
        await logEntry(page, book.id, 25, LONG_NOTE);          // +15 pages with a note
        await logEntry(page, book.id, 25, "Just a quick thought."); // a note on its own

        await page.goto(`/index.html?v=${Date.now()}#/book/${book.id}`);
        await expect(entries(page)).toHaveCount(2);
        const noteOnly = entries(page).nth(0);
        const withPages = entries(page).nth(1);
        await expect(withPages).toContainText("+15");

        // Shortened at first; a click opens it with Edit and Delete, another click closes it again.
        const longNote = withPages.locator(".session-note-btn");
        await expect(longNote).toHaveAttribute("aria-expanded", "false");
        const shortHeight = await withPages.locator(".session-note").evaluate((el) => el.getBoundingClientRect().height);
        await expect(withPages.getByRole("button", { name: "Edit" })).toHaveCount(0);
        await longNote.click();
        await expect(longNote).toHaveAttribute("aria-expanded", "true");
        expect(await withPages.locator(".session-note").evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(shortHeight);
        await expect(withPages.getByRole("button", { name: "Edit" })).toBeVisible();
        await expect(withPages.getByRole("button", { name: "Delete" })).toBeVisible();
        await longNote.click();
        await expect(withPages.getByRole("button", { name: "Edit" })).toHaveCount(0);

        // Edit the note-only entry.
        await noteOnly.locator(".session-note-btn").click();
        await noteOnly.getByRole("button", { name: "Edit" }).click();
        const edit = dialog(page, "Edit note");
        const text = edit.getByLabel("Note");
        await expect(text).toBeFocused();
        await expect(text).toHaveValue("Just a quick thought.");
        await text.fill("   ");
        await edit.getByRole("button", { name: "Save note" }).click();
        await expect(edit.locator(".form-error")).toHaveText("Write a note, or use Delete to remove it.");
        await text.fill("Actually, the harbour scene was the best part.");
        await edit.getByRole("button", { name: "Save note" }).click();
        await expectToast(page, "Note updated");
        await expect(noteOnly.locator(".session-note")).toHaveText("Actually, the harbour scene was the best part.");

        // The dashboard's recent entries show the change too (same journal).
        await page.getByRole("link", { name: "Dashboard" }).first().click();
        await expect(page.locator(".dash-entries")).toContainText("Actually, the harbour scene was the best part.");
        await page.goBack();

        // Deleting the note of an entry with pages keeps the pages.
        await entries(page).nth(1).locator(".session-note-btn").click();
        await entries(page).nth(1).getByRole("button", { name: "Delete" }).click();
        const confirm = dialog(page, "Delete this note?");
        await expect(confirm).toContainText("The 15 pages you logged that day stay in your journal.");
        await confirm.getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Note deleted");
        await expect(entries(page)).toHaveCount(2);
        await expect(entries(page).nth(1)).toContainText("+15");
        await expect(entries(page).nth(1).locator(".session-note")).toHaveCount(0);

        // Deleting a note-only entry's note removes the entry.
        await entries(page).nth(0).locator(".session-note-btn").click();
        await entries(page).nth(0).getByRole("button", { name: "Delete" }).click();
        await expect(dialog(page, "Delete this note?")).toContainText("will be deleted from your journal.");
        await dialog(page, "Delete this note?").getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Note deleted");
        await expect(entries(page)).toHaveCount(1);
        await expect(entries(page).first()).toContainText("+15");

        // All of it was saved: still the same after a reload, and the book's progress didn't move.
        await page.reload();
        await expect(entries(page)).toHaveCount(1);
        await expect(page.locator(".session-progress .pages")).toHaveText("Page 25 of 100");
    });

    test("only the owner can change a note, and the server checks what it's sent", async ({ page, browser, api }) => {
        const book = await api.createBook({ title: "Storm Harbour", status: "Reading", totalPages: 100, currentPage: 10 });
        await logEntry(page, book.id, 20, "Mine.");
        const entryId = String((await (await page.request.get("/api/activities")).json()).data[0].id);

        expect((await page.request.put(`/api/activities/${entryId}/note`, { data: { note: "" } })).status()).toBe(400);
        expect((await page.request.put(`/api/activities/${entryId}/note`, { data: { note: "x".repeat(20001) } })).status()).toBe(400);
        expect((await page.request.put("/api/activities/not-a-number/note", { data: { note: "x" } })).status()).toBe(400);
        expect((await page.request.delete("/api/activities/999999999999/note")).status()).toBe(404);

        const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
        await blockExternal(other);
        const email = `e2e-other${Date.now()}${Math.floor(Math.random() * 1e6)}@example.test`;
        const password = "E2e-test-pass-123";
        expect((await other.request.post("/api/auth/register", { data: { username: `Other ${Date.now()}${Math.floor(Math.random() * 1e6)}`, email, password } })).ok()).toBeTruthy();
        expect((await other.request.post("/api/auth/login", { data: { email, password } })).ok()).toBeTruthy();
        try {
            expect((await other.request.put(`/api/activities/${entryId}/note`, { data: { note: "Hacked" } })).status()).toBe(404);
            expect((await other.request.delete(`/api/activities/${entryId}/note`)).status()).toBe(404);
        } finally {
            await other.request.delete("/api/auth/account", { data: { password } });
            await other.close();
        }
        const mine = (await (await page.request.get("/api/activities")).json()).data[0];
        expect(mine.note).toBe("Mine.");
    });
});
