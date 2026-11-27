import { test, expect, expectToast, dialog, blockExternal } from "./fixtures";
import type { Page } from "@playwright/test";

// Chapters: a number of chapters in Edit details; a Chapters card on the book page (below Challenge spots
// and Notes); notes filed under a chapter from Log your reading.

async function openBook(page: Page, id: string) {
    await page.goto(`/index.html?v=${Date.now()}#/book/${id}`);
    await expect(page.locator(".book-hero h1")).toBeVisible();
}
const card = (page: Page) => page.locator("section.chapters-card");
const row = (page: Page, n: number) => card(page).locator(".chapter-row").nth(n - 1);

test.describe("Chapters", () => {
    test("set chapters, write notes under a chapter, and see them on the book page", async ({ page, api }) => {
        const book = await api.createBook({ title: "Five Parts", status: "Reading", totalPages: 200, currentPage: 10 });
        await openBook(page, book.id);
        await expect(card(page)).toHaveCount(0); // no chapters yet: no card, no picker
        await page.locator(".session-log").click();
        await expect(dialog(page, "Log your reading").locator(".chapter-picks")).toHaveCount(0);
        await dialog(page, "Log your reading").getByRole("button", { name: "Cancel" }).click();

        // Edit details: the Chapters field.
        await page.getByRole("button", { name: "Edit details" }).click();
        let edit = dialog(page, "Edit details");
        await edit.getByLabel("Chapters").fill("0");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expect(edit.locator(".form-error")).toHaveText("Chapters must be a whole number from 1 to 999.");
        await edit.getByLabel("Chapters").fill("5");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // The card lists Chapter 1-5, all blank.
        await expect(card(page).locator(".chapter-row strong")).toHaveText(["Chapter 1", "Chapter 2", "Chapter 3", "Chapter 4", "Chapter 5"]);
        await expect(card(page)).toContainText("0 of 5 chapters with notes");
        await expect(card(page).locator(".chapter-notes")).toHaveCount(0);

        // Log your reading: pick Chapter 3 and write about it.
        await page.locator(".session-log").click();
        let log = dialog(page, "Log your reading");
        const picks = log.getByRole("group", { name: /Chapter/ }).getByRole("button");
        await expect(picks).toHaveText(["1", "2", "3", "4", "5"]);
        await picks.nth(2).click();
        await expect(picks.nth(2)).toHaveAttribute("aria-pressed", "true");
        await expect(log.getByLabel("Notes on Chapter 3")).toBeVisible();
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expect(log.locator(".form-error")).toHaveText("Write your note on Chapter 3, or tap the chapter again to unpick it.");
        await log.getByLabel("Notes on Chapter 3").fill("The twist with the lighthouse keeper!");
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Saved to Chapter 3");

        await expect(row(page, 3).locator(".session-note")).toHaveText("The twist with the lighthouse keeper!");
        await expect(card(page)).toContainText("1 of 5 chapters with notes");
        await expect(row(page, 1).locator(".chapter-notes")).toHaveCount(0);
        // Reading progress leaves chapter notes to the Chapters card.
        const progressCard = page.locator("section.card", { has: page.getByRole("heading", { name: "Reading progress" }) });
        await expect(progressCard).not.toContainText("lighthouse keeper");
        await expect(progressCard.locator(".session-empty")).toHaveText("No journal entries yet.");

        // "Add a note" on a chapter opens Log your reading with it picked; chapters with notes have a dot.
        await row(page, 3).getByRole("button", { name: "Add a note on Chapter 3" }).click();
        log = dialog(page, "Log your reading");
        await expect(log.getByRole("button", { name: "Chapter 3 (has notes)" })).toHaveAttribute("aria-pressed", "true");
        await log.getByLabel("Notes on Chapter 3").fill("Reread it: even better.");
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Saved to Chapter 3");
        await expect(row(page, 3).locator(".session-note")).toHaveText(["Reread it: even better.", "The twist with the lighthouse keeper!"]);

        // Tapping the chapter again unpicks it: a general note isn't filed under any chapter.
        await page.locator(".session-log").click();
        log = dialog(page, "Log your reading");
        await log.getByRole("button", { name: /^Chapter 1/ }).click();
        await log.getByRole("button", { name: /^Chapter 1/ }).click();
        await expect(log.getByLabel("Notes", { exact: true })).toBeVisible();
        await log.getByLabel("Notes", { exact: true }).fill("A general thought.");
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Saved to your journal");
        await expect(card(page).locator(".chapter-notes .session-note")).toHaveCount(2);
        // ...while a general note stays in Reading progress.
        await expect(page.locator("ul.sessions .session-note")).toHaveText(["A general thought."]);

        // A chapter with notes can't disappear.
        await page.getByRole("button", { name: "Edit details" }).click();
        edit = dialog(page, "Edit details");
        await edit.getByLabel("Chapters").fill("2");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expect(edit.locator(".form-error")).toHaveText("Chapter 3 has notes, so the book needs at least 3 chapters.");
        await edit.getByLabel("Chapters").fill("");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expect(edit.locator(".form-error")).toHaveText("Chapter 3 has notes, so the book needs at least 3 chapters.");
        await edit.getByRole("button", { name: "Cancel" }).click();

        // The Reading Recap names the chapter too.
        await page.getByRole("link", { name: "Statistics" }).first().click();
        await expect(page.locator("section.recap")).toContainText("Chapter 3 · Journal note");
        await page.goBack();

        // Deleting both chapter notes frees the chapter; then the count can go down.
        for (let i = 0; i < 2; i++) {
            await row(page, 3).locator(".session-note-btn").first().click();
            await row(page, 3).getByRole("button", { name: "Delete" }).first().click();
            await dialog(page, "Delete this note?").getByRole("button", { name: "Delete" }).click();
            await expectToast(page, "Note deleted");
            await expect(row(page, 3).locator(".session-note")).toHaveCount(1 - i); // gone at once
        }
        await expect(row(page, 3).locator(".chapter-notes")).toHaveCount(0);
        await page.getByRole("button", { name: "Edit details" }).click();
        edit = dialog(page, "Edit details");
        await edit.getByLabel("Chapters").fill("2");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(card(page).locator(".chapter-row")).toHaveCount(2);
    });

    test("Reading progress keeps the pages of a chapter entry but leaves its note to the Chapters card", async ({ page, api }) => {
        const book = await api.createBook({ title: "Five Parts", status: "Reading", totalPages: 200, currentPage: 10 });
        const put = (extra: Record<string, unknown>) => page.request.put(`/api/books/${book.id}`, {
            data: { title: "Five Parts", author: "Test Author", status: "Reading", totalPages: 200, chapterCount: 5, genres: [], subgenres: [], quotes: [], ...extra }
        });
        expect((await put({ currentPage: 40, sessionNote: "Chapter two flew by.", sessionChapter: 2 })).ok()).toBeTruthy(); // pages + chapter note
        expect((await put({ currentPage: 40, sessionNote: "On its own, about chapter four.", sessionChapter: 4 })).ok()).toBeTruthy(); // chapter note only
        expect((await put({ currentPage: 40, sessionNote: "A general thought." })).ok()).toBeTruthy(); // general note

        await openBook(page, book.id);
        const sessions = page.locator("ul.sessions > li");
        await expect(sessions).toHaveCount(2);
        await expect(sessions.nth(0).locator(".session-note")).toHaveText("A general thought.");
        await expect(sessions.nth(1)).toContainText("p. 10 → 40");
        await expect(sessions.nth(1)).toContainText("+30");
        await expect(sessions.nth(1).locator(".session-note")).toHaveCount(0);
        await expect(page.locator("ul.sessions")).not.toContainText("Chapter");

        await expect(row(page, 2).locator(".session-note")).toHaveText("Chapter two flew by.");
        await expect(row(page, 4).locator(".session-note")).toHaveText("On its own, about chapter four.");
    });

    test("the server checks chapters and keeps chapter notes private", async ({ page, browser, api }) => {
        const plain = await api.createBook({ title: "No Chapters", status: "Reading", totalPages: 100, currentPage: 5 });
        const put = (id: string, extra: Record<string, unknown>) => page.request.put(`/api/books/${id}`, {
            data: { title: "No Chapters", author: "Test Author", status: "Reading", totalPages: 100, currentPage: 5, genres: [], subgenres: [], quotes: [], ...extra }
        });
        let r = await put(plain.id, { sessionNote: "x", sessionChapter: 2 });
        expect(r.status()).toBe(400);
        expect((await r.json()).message).toBe("Add the number of chapters in Edit details first.");
        expect((await put(plain.id, { chapterCount: 1000 })).status()).toBe(400);

        expect((await put(plain.id, { chapterCount: 5 })).ok()).toBeTruthy();
        r = await put(plain.id, { chapterCount: 5, sessionNote: "x", sessionChapter: 9 });
        expect((await r.json()).message).toBe("This book has 5 chapters.");
        expect((await put(plain.id, { chapterCount: 5, sessionNote: "Mine.", sessionChapter: 4 })).ok()).toBeTruthy();
        const mine = (await (await page.request.get(`/api/activities/book/${plain.id}/chapters`)).json()).data;
        expect(mine.map((a: { chapter: number; note: string }) => [a.chapter, a.note])).toEqual([[4, "Mine."]]);

        const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
        await blockExternal(other);
        const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        const email = `e2e-other${stamp}@example.test`;
        const password = "E2e-test-pass-123";
        expect((await other.request.post("/api/auth/register", { data: { username: `Other ${stamp}`, email, password } })).ok()).toBeTruthy();
        expect((await other.request.post("/api/auth/login", { data: { email, password } })).ok()).toBeTruthy();
        try {
            expect((await (await other.request.get(`/api/activities/book/${plain.id}/chapters`)).json()).data).toEqual([]);
        } finally {
            await other.request.delete("/api/auth/account", { data: { password } });
            await other.close();
        }
    });
});
