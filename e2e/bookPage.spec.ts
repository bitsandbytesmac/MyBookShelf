import { test, expect, expectToast, dialog } from "./fixtures";
import type { Page } from "@playwright/test";

// The book page and the Add a book search. Runs against the vanilla app and the React build.
// The Google Books search is answered inside the browser with made-up results (page.route), so the
// test never reaches the server's search endpoint or spends the Google Books quota.

async function openBook(page: Page, id: string) {
    // A query that changes every time forces a real reload, so books just made through the API are loaded.
    await page.goto(`/index.html?v=${Date.now()}#/book/${id}`);
    await expect(page.locator(".book-hero h1")).toBeVisible();
}

test.describe("Book page", () => {
    test("status, favourite, notes and delete", async ({ page, api }) => {
        const book = await api.createBook({ title: "Page Turner", author: "Ann Writer & Bo Writer", totalPages: 300 });
        await openBook(page, book.id);
        await expect(page).toHaveTitle("Page Turner · MyBookShelf");

        // Co-authors each get a link to their page.
        const by = page.locator(".book-hero .by");
        await expect(by.getByRole("link")).toHaveText(["Ann Writer", "Bo Writer"]);
        await expect(by.getByRole("link", { name: "Bo Writer" })).toHaveAttribute("href", "#/author/Bo%20Writer");

        // Status from the hero: dates and badge follow.
        await page.getByRole("combobox", { name: "Book status" }).selectOption("Reading");
        await expectToast(page, "Moved to Reading");
        await expect(page.locator(".book-hero .badge").first()).toHaveText("Reading");

        // Favourite toggles both ways.
        await page.getByRole("button", { name: "Add to favorites" }).click();
        await expectToast(page, "Added to favorites");
        await expect(page.getByRole("button", { name: "Remove from favorites" })).toHaveAttribute("aria-pressed", "true");

        // Notes: Save is only enabled once something changed.
        const notes = page.getByRole("textbox", { name: "Notes" });
        const save = page.getByRole("button", { name: "Save notes" });
        await expect(save).toBeDisabled();
        await notes.fill("Theory: the butler did it.");
        await save.click();
        await expectToast(page, "Notes saved");
        await expect(save).toBeDisabled();
        await page.reload();
        await expect(page.getByRole("textbox", { name: "Notes" })).toHaveValue("Theory: the butler did it.");
        await expect(page.getByRole("button", { name: "Remove from favorites" })).toBeVisible();

        // Delete asks first; Cancel keeps the book.
        await page.getByRole("button", { name: "Delete book" }).click();
        const confirm = dialog(page, "Delete this book?");
        await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
        await confirm.getByRole("button", { name: "Cancel" }).click();
        await expect(confirm).toBeHidden();
        await page.getByRole("button", { name: "Delete book" }).click();
        await dialog(page, "Delete this book?").getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Book deleted");
        await expect(page).toHaveURL(/#\/library$/);
        await expect(page.getByText("Your To Be Read starts here")).toBeVisible();
    });

    test("a long summary folds, and the review dialog saves rating, spice, quotes and dates", async ({ page, api }) => {
        const book = await api.createBook({ title: "Long Story", totalPages: 100 });
        const summary = "A very long summary. ".repeat(30);
        await page.request.put(`/api/books/${book.id}`, {
            data: { title: "Long Story", author: "Test Author", status: "To Be Read", totalPages: 100, summary, genres: [], subgenres: [], quotes: [] }
        });
        await openBook(page, book.id);

        const text = page.locator(".summary-text");
        await expect(text).toHaveClass(/clamped/);
        await page.getByRole("button", { name: "Read more" }).click();
        await expect(text).not.toHaveClass(/clamped/);
        await page.getByRole("button", { name: "Show less" }).click();
        await expect(text).toHaveClass(/clamped/);

        await page.getByRole("button", { name: "Write review" }).click();
        const review = dialog(page, "Review · Long Story");
        await expect(review.getByLabel("Review", { exact: true })).toBeFocused();
        await review.getByRole("radiogroup", { name: "Rating" }).getByRole("radio", { name: "4 of 5" }).click();
        await review.getByRole("radiogroup", { name: "Spice level" }).getByRole("radio", { name: "2 of 5" }).click();
        await review.getByLabel("New quote").fill("First quote.");
        await review.getByRole("button", { name: "Add", exact: true }).click();
        await review.getByLabel("New quote").fill("Second quote.");
        await review.getByRole("button", { name: "Add", exact: true }).click();
        await review.getByRole("button", { name: "Remove quote" }).first().click();
        await review.getByLabel("New quote").fill("Typed but not added.");
        await review.getByLabel("Date started").fill("2026-11-10");
        await review.getByLabel("Date finished").fill("2026-11-01");
        await review.getByRole("button", { name: "Save review" }).click();
        await expect(review.locator(".form-error")).toHaveText("Date finished can't be before date started.");
        await review.getByLabel("Date finished").fill("");
        await review.getByLabel("Review", { exact: true }).fill("Loved it.");
        await review.getByRole("button", { name: "Save review" }).click();
        await expectToast(page, "Review saved");

        await page.reload();
        await expect(page.locator(".review-scores .stars")).toHaveAttribute("aria-label", "4 out of 5 stars");
        await expect(page.locator(".review-scores .chilis")).toHaveAttribute("aria-label", "Spice 2 out of 5");
        await expect(page.locator(".review-quotes blockquote")).toHaveText(["Second quote.", "Typed but not added."]);
        await expect(page.locator(".review-text")).toHaveText("Loved it.");
        await expect(page.getByRole("button", { name: "Edit review" })).toBeVisible();
    });
});

test.describe("Add a book", () => {
    test("search results fill in the book; one already on the shelf can't be added twice", async ({ page, api }) => {
        await api.createBook({ title: "Already Here", author: "Shelf Writer" });
        await page.route("**/api/google-books/search**", (route) => route.fulfill({
            json: {
                status: "success",
                data: [
                    {
                        id: "a", volumeInfo: {
                            title: "Catching Fire (The Hunger Games #2)", authors: ["Suzanne Collins"], pageCount: 391,
                            publishedDate: "2009-09-01", categories: ["Fiction / Science Fiction"], description: "<p>Katniss <b>wins</b>.</p>"
                        }
                    },
                    { id: "b", volumeInfo: { title: "Already Here", authors: ["Shelf Writer"] } }
                ]
            }
        }));

        await page.goto("/index.html#/library");
        await page.locator("[data-action='add-book']").click();
        const add = dialog(page, /^Add a book$/);
        await expect(add.getByLabel("Search Google Books")).toBeFocused();
        await add.getByRole("button", { name: "Search" }).click(); // nothing typed: nothing sent
        await add.getByLabel("Search Google Books").fill("catching fire");
        await add.getByLabel("Search Google Books").press("Enter");

        const results = add.locator(".search-result");
        await expect(results).toHaveCount(2);
        await expect(results.nth(0)).toContainText("Catching Fire");
        await expect(results.nth(0)).toContainText("Suzanne Collins · 2009 · 391 pages");
        await expect(results.nth(0)).toContainText("The Hunger Games #2");
        await expect(results.nth(1).getByRole("button", { name: "On your shelf" })).toBeDisabled();

        await results.nth(0).getByRole("button", { name: "Add" }).click();
        await expectToast(page, `"Catching Fire" added to your To Be Read`);
        await expect(add).toBeHidden();
        await expect(page.getByRole("heading", { level: 1, name: "Catching Fire" })).toBeVisible();
        await expect(page.getByRole("link", { name: "The Hunger Games · Book 2" }).first()).toBeVisible();
        await expect(page.locator(".summary-text")).toHaveText("Katniss wins.");
        await expect(page.locator(".detail-list")).toContainText("Science Fiction");
    });

    test("no results, then Add manually carries the search text over", async ({ page, account }) => {
        void account;
        await page.route("**/api/google-books/search**", (route) => route.fulfill({ json: { status: "success", data: [] } }));
        await page.goto("/index.html#/library");
        await page.getByRole("button", { name: "Add a book" }).first().click();
        const add = dialog(page, /^Add a book$/);
        await add.getByLabel("Search Google Books").fill("A Very Obscure Book");
        await add.getByRole("button", { name: "Search" }).click();
        await expect(add.locator(".search-status")).toHaveText("No matches. Try different words, or add it manually.");

        await add.getByRole("button", { name: "Can't find it? Add manually" }).click();
        const manual = dialog(page, "Add a book manually");
        await expect(manual.getByLabel("Title")).toHaveValue("A Very Obscure Book");
        await expect(add).toBeHidden();

        await manual.getByRole("button", { name: "Add to To Be Read" }).click();
        await expect(manual.locator(".form-error")).toHaveText("Add an author.");
        await manual.getByLabel("Author").fill("Nobody Knows");
        await manual.getByLabel("Total pages").fill("12.5");
        await manual.getByRole("button", { name: "Add to To Be Read" }).click();
        await expect(manual.locator(".form-error")).toHaveText("Total pages must be a whole number.");
        await manual.getByLabel("Total pages").fill("120");
        await manual.getByRole("button", { name: "Add to To Be Read" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "A Very Obscure Book" })).toBeVisible();
        await expect(page.locator(".session-progress .pages")).toHaveText("Page 0 of 120");
    });
});
