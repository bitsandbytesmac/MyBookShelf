import { test, expect, expectToast, dialog, today } from "./fixtures";
import type { Page } from "@playwright/test";

// Edit details (November 2026 update): Goodreads review link, Re-read, Age Demo (several, without
// Children/Middle Grade), Setting as free text, no Themes/Characters, and deleting categories from the
// reader's own lists.

async function openEdit(page: Page, id: string) {
    await page.goto(`/index.html?v=${Date.now()}#/book/${id}`);
    await page.getByRole("button", { name: "Edit details" }).click();
    return dialog(page, "Edit details");
}

test.describe("Edit details", () => {
    test("Goodreads link, Re-read, Age Demo and Setting save and show on the book page", async ({ page, api }) => {
        const book = await api.createBook({ title: "Island Days" });
        let edit = await openEdit(page, book.id);

        // Themes & keywords and Characters are gone.
        await expect(edit.locator("details.foldout summary")).toHaveText([/^Genres/, /^Sub-genres/, /^Tropes/, /^Trigger \/ content warnings/]);

        // Age Demo: several at once, and only the three ages.
        const ages = edit.getByRole("group", { name: "Age Demo" });
        await expect(ages.getByRole("button")).toHaveText(["Young Adult", "New Adult", "Adult"]);
        await ages.getByRole("button", { name: "Young Adult" }).click();
        await ages.getByRole("button", { name: "Adult", exact: true }).click();

        await edit.getByLabel("Setting").fill("A small island in 1920s Scotland");
        await edit.getByRole("checkbox", { name: /Re-read/ }).check();

        // The Goodreads link is checked before saving.
        const goodreads = edit.getByLabel("Goodreads review");
        await goodreads.fill("https://example.com/my-review");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expect(edit.locator(".form-error")).toHaveText("That isn't a Goodreads link. It should start with https://www.goodreads.com/");
        await goodreads.fill("goodreads.com/review/show/12345");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // Saved on the server: check after a reload.
        await page.reload();
        const hero = page.locator(".book-hero");
        await expect(hero.locator(".badge.meta")).toHaveText(["Re-read", "Young Adult", "Adult"]);
        const details = page.locator(".detail-list");
        await expect(details).toContainText("Young Adult, Adult");
        await expect(details).toContainText("A small island in 1920s Scotland");
        await expect(details).not.toContainText("Themes & keywords");
        await expect(details).not.toContainText("Characters");
        for (const link of await page.getByRole("link", { name: "My review on Goodreads ↗" }).all()) {
            await expect(link).toHaveAttribute("href", "https://goodreads.com/review/show/12345");
            await expect(link).toHaveAttribute("target", "_blank");
            await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        }
        await expect(page.getByRole("link", { name: "My review on Goodreads ↗" })).toHaveCount(2); // review card + details

        // Clearing the link removes it; unticking Re-read too.
        edit = await openEdit(page, book.id);
        await expect(edit.getByLabel("Goodreads review")).toHaveValue("https://goodreads.com/review/show/12345");
        await edit.getByLabel("Goodreads review").fill("");
        await edit.getByRole("checkbox", { name: /Re-read/ }).uncheck();
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(page.getByRole("link", { name: "My review on Goodreads ↗" })).toHaveCount(0);
        await expect(page.locator(".book-hero .badge.meta")).toHaveText(["Young Adult", "Adult"]);
    });

    test("the server only keeps Goodreads links, and older age values stay on a book until unticked", async ({ page, api }) => {
        const book = await api.createBook({ title: "Old Favourite" });
        const put = (extra: Record<string, unknown>) => page.request.put(`/api/books/${book.id}`, {
            data: { title: "Old Favourite", author: "Test Author", status: "To Be Read", genres: [], subgenres: [], quotes: [], ...extra }
        });
        for (const bad of ["javascript:alert(1)", "https://goodreads.com.evil.example/x", "ftp://www.goodreads.com/x"]) {
            const r = await put({ goodreadsUrl: bad });
            expect(r.status(), bad).toBe(400);
        }
        expect((await put({ ageDemos: ["Teen"] })).status()).toBe(400);

        // A book from before the change can have Middle Grade: it shows, and can be unticked.
        expect((await put({ ageDemos: ["Middle Grade"] })).ok()).toBeTruthy();
        const edit = await openEdit(page, book.id);
        const ages = edit.getByRole("group", { name: "Age Demo" });
        await expect(ages.getByRole("button")).toHaveText(["Young Adult", "New Adult", "Adult", "Middle Grade"]);
        await expect(ages.getByRole("button", { name: "Middle Grade" })).toHaveAttribute("aria-pressed", "true");
        await ages.getByRole("button", { name: "Middle Grade" }).click();
        await ages.getByRole("button", { name: "New Adult" }).click();
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(page.locator(".detail-list")).toContainText("New Adult");
        await expect(page.locator(".detail-list")).not.toContainText("Middle Grade");
    });

    test("a challenge's Setting rule matches a word in the book's setting text", async ({ page, api }) => {
        const book = await api.createBook({ title: "Sea Glass", status: "Read", dateFinished: today() });
        const r = await page.request.post("/api/challenges", {
            data: { name: "Around the World", description: "", autoMatch: true, items: [{ label: "An island", bookId: null, criteria: { settings: ["Island"] } }] }
        });
        expect(r.ok(), await r.text()).toBeTruthy();

        const edit = await openEdit(page, book.id);
        await edit.getByLabel("Setting").fill("A windswept island off the coast");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        const spots = page.locator(".challenge-spots");
        await expect(spots).toContainText("An island");
        await expect(spots.locator(".reason-chip").first()).toHaveText("Setting: Island");
        await expect(spots.getByRole("button", { name: "Count it" })).toBeVisible();
    });

    test("categories can be deleted from the lists, and typing one again brings it back", async ({ page, api }) => {
        const tagged = await api.createBook({ title: "Scary Story", genres: ["Horror"] });
        const other = await api.createBook({ title: "Plain Story" });

        let edit = await openEdit(page, other.id);
        await edit.locator("summary", { hasText: "Genres" }).first().click();
        const genres = edit.getByRole("group", { name: "Genres" });
        await expect(genres.getByRole("button", { name: "Horror", exact: true })).toBeVisible();

        await edit.getByRole("button", { name: "Edit list" }).first().click();
        await genres.getByRole("button", { name: "Delete “Horror” from your list" }).click();
        await expectToast(page, "“Horror” deleted from your genres");
        await genres.getByRole("button", { name: "Delete “Poetry” from your list" }).click();
        await expectToast(page, "“Poetry” deleted from your genres");
        await edit.getByRole("button", { name: "Done" }).click();
        await expect(genres.getByRole("button", { name: "Horror", exact: true })).toHaveCount(0);
        await expect(genres.getByRole("button", { name: "Poetry", exact: true })).toHaveCount(0);
        await edit.getByRole("button", { name: "Cancel" }).click();

        // Saved for the account; the book that has it keeps it.
        const hidden = (await (await page.request.get("/api/tags/hidden")).json()).data;
        expect(hidden.genres).toEqual(["Horror", "Poetry"]);
        await page.goto(`/index.html?v=${Date.now()}#/book/${tagged.id}`);
        await expect(page.locator(".book-hero .badge.tag")).toHaveText(["Horror"]);
        edit = await openEdit(page, tagged.id);
        await edit.locator("summary", { hasText: "Genres" }).first().click();
        // (A ticked pill's name starts with its ✓ mark.)
        await expect(edit.getByRole("group", { name: "Genres" }).getByRole("button", { name: /Horror$/ })).toHaveAttribute("aria-pressed", "true");
        await edit.getByRole("button", { name: "Cancel" }).click();

        // Typing a deleted one again puts it back on the list.
        edit = await openEdit(page, other.id);
        await edit.locator("summary", { hasText: "Genres" }).first().click();
        await edit.getByLabel("Genres: add your own", { exact: true }).fill("poetry");
        await edit.getByLabel("Genres: add your own", { exact: true }).press("Enter");
        // It comes back in its own spelling, once (not as a second "poetry").
        await expect(edit.getByRole("group", { name: "Genres" }).getByRole("button", { name: /poetry$/i })).toHaveCount(1);
        await expect(edit.getByRole("group", { name: "Genres" }).getByRole("button", { name: /Poetry$/ })).toHaveAttribute("aria-pressed", "true");
        await expect.poll(async () => (await (await page.request.get("/api/tags/hidden")).json()).data.genres).toEqual(["Horror"]);

        // Other lists work the same way; the server checks what it's sent.
        expect((await page.request.put("/api/tags/hidden", { data: { tropes: "not a list" } })).status()).toBe(400);
        expect((await page.request.put("/api/tags/hidden", { data: { tropes: ["Slow Burn"], secret: ["ignored"] } })).ok()).toBeTruthy();
        const saved = (await (await page.request.get("/api/tags/hidden")).json()).data;
        expect(saved).toEqual({ genres: [], subgenres: [], tropes: ["Slow Burn"], contentWarnings: [] });
    });
});
