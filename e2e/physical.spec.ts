import { test, expect, expectToast, dialog } from "./fixtures";
import type { Page } from "@playwright/test";

// Physical Books (#/physical) shows only books ticked "Physical book" in Add/Edit details.

const shelfTitles = (page: Page) => page.locator(".bookcase .shelf-book");

async function openPhysical(page: Page) {
    // A changing query forces a real reload, so books made through the API are loaded.
    await page.goto(`/index.html?v=${Date.now()}#/physical`);
    await expect(page.getByRole("heading", { level: 1, name: "Physical Books" })).toBeVisible();
}

test.describe("Physical Books", () => {
    test("ticking Physical book in Edit details puts it on the shelf, unticking takes it off", async ({ page, api }) => {
        const book = await api.createBook({ title: "Paper Copy", author: "Ink Writer" });
        await api.createBook({ title: "Only An E-book", format: "E-book" });

        await openPhysical(page);
        await expect(page.getByRole("heading", { name: "No physical books yet" })).toBeVisible();
        await expect(page.locator("nav.tabs .tab", { hasText: "Physical Books" })).toHaveAttribute("aria-current", "page");

        await page.goto(`/index.html#/book/${book.id}`);
        await page.getByRole("button", { name: "Edit details" }).click();
        let edit = dialog(page, "Edit details");
        const box = edit.getByRole("checkbox", { name: /Physical book/ });
        await expect(box).not.toBeChecked();
        await box.check();
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(page.locator(".book-hero").getByRole("link", { name: "Physical book" })).toBeVisible();

        // Saved on the server: still ticked after a reload.
        await openPhysical(page);
        await expect(shelfTitles(page)).toHaveCount(1);
        await expect(shelfTitles(page).first()).toHaveAttribute("aria-label", /^Paper Copy · Ink Writer/);
        await expect(page.getByText("1 physical book on your shelf")).toBeVisible();

        await shelfTitles(page).first().click();
        await expect(page).toHaveURL(new RegExp(`#/book/${book.id}$`));
        await page.getByRole("button", { name: "Edit details" }).click();
        edit = dialog(page, "Edit details");
        await expect(edit.getByRole("checkbox", { name: /Physical book/ })).toBeChecked();
        await edit.getByRole("checkbox", { name: /Physical book/ }).uncheck();
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(page.locator(".book-hero").getByRole("link", { name: "Physical book" })).toHaveCount(0);

        await page.getByRole("link", { name: "Physical Books", exact: true }).click();
        await expect(page.getByRole("heading", { name: "No physical books yet" })).toBeVisible();
    });

    test("a manually added book goes on the shelf only when the box is ticked", async ({ page, account }) => {
        void account;
        const addManually = async (title: string, physical: boolean) => {
            await page.locator("[data-action='add-book']").click();
            await dialog(page, "Add a book").getByRole("button", { name: "Can't find it? Add manually" }).click();
            const add = dialog(page, "Add a book manually");
            await add.getByLabel("Title").fill(title);
            await add.getByLabel("Author").fill("Shelf Writer");
            if (physical) await add.getByRole("checkbox", { name: /Physical book/ }).check();
            await add.getByRole("button", { name: "Add to To Be Read" }).click();
            await expectToast(page, `"${title}" added to your To Be Read`);
        };

        await page.goto("/index.html#/library");
        await addManually("Hardback Treasure", true);
        await addManually("Library Loan", false);

        await page.getByRole("link", { name: "Physical Books", exact: true }).click();
        await expect(shelfTitles(page)).toHaveCount(1);
        await expect(shelfTitles(page).first()).toHaveAttribute("aria-label", /^Hardback Treasure/);
        // The Library still has both.
        await page.getByRole("link", { name: "Library" }).first().click();
        await expect(page.getByText("2 books on your shelf")).toBeVisible();
    });

    test("search and status filter the physical shelf", async ({ page, api }) => {
        await api.createBook({ title: "Dune", author: "Frank Herbert", isPhysical: true, status: "Reading", totalPages: 100, currentPage: 10 });
        await api.createBook({ title: "Emma", author: "Jane Austen", isPhysical: true });
        await api.createBook({ title: "Persuasion", author: "Jane Austen" });

        await openPhysical(page);
        await expect(shelfTitles(page)).toHaveCount(2);

        await page.getByRole("searchbox", { name: "Search physical books" }).fill("austen");
        await expect(shelfTitles(page)).toHaveCount(1);
        await expect(shelfTitles(page).first()).toHaveAttribute("aria-label", /^Emma/);

        await page.getByRole("searchbox", { name: "Search physical books" }).fill("");
        await page.getByRole("combobox", { name: "Status" }).selectOption("Reading");
        await expect(shelfTitles(page)).toHaveCount(1);
        await expect(shelfTitles(page).first()).toHaveAttribute("aria-label", /^Dune/);

        await page.getByRole("combobox", { name: "Status" }).selectOption("Read");
        await expect(page.getByRole("heading", { name: "No physical books match" })).toBeVisible();
    });
});
