import { test, expect, today } from "./fixtures";

// The Authors pages (and the "not found" pages for authors and series). Runs against the vanilla app
// and the React build.

test.describe("Authors", () => {
    test("every author gets a card, co-authors included; search and sort work", async ({ page, api }) => {
        await api.createBook({ title: "Solo One", author: "Ann Writer", status: "Read", dateFinished: today() });
        await api.createBook({ title: "Solo Two", author: "Ann Writer" });
        await api.createBook({ title: "Together", author: "Bo Writer & Ann Writer" });
        await api.createBook({ title: "Elsewhere", author: "Cy Writer" });

        await page.goto(`/index.html?v=${Date.now()}#/authors`);
        await expect(page.getByRole("heading", { level: 1, name: "Authors" })).toBeVisible();
        await expect(page.locator(".page-head p")).toHaveText("3 authors on your shelf");

        // Most books first (the default sort).
        const cards = page.locator(".author-card");
        await expect(cards.locator("h3")).toHaveText(["Ann Writer", "Bo Writer", "Cy Writer"]);
        await expect(cards.first().locator(".sub")).toHaveText("3 books · 1 read");

        await page.getByRole("combobox", { name: "Sort authors" }).selectOption("name");
        await expect(cards.locator("h3")).toHaveText(["Ann Writer", "Bo Writer", "Cy Writer"]);
        await page.getByRole("searchbox", { name: "Search authors" }).fill("cy");
        await expect(cards.locator("h3")).toHaveText(["Cy Writer"]);
        await page.getByRole("searchbox", { name: "Search authors" }).fill("zzz");
        await expect(page.getByRole("heading", { name: "No matching authors" })).toBeVisible();
    });

    test("an author's page: stats, their series, and every book", async ({ page, api }) => {
        await api.createBook({ title: "Saga Two", author: "Dee Writer", series: "Dee Saga", seriesNumber: 2, seriesTotal: 3, status: "Read", dateFinished: today(), totalPages: 200 });
        await api.createBook({ title: "Saga One", author: "Dee Writer", series: "Dee Saga", seriesNumber: 1, seriesTotal: 3, status: "Read", dateFinished: today(), totalPages: 100 });
        await api.createBook({ title: "A Standalone", author: "Dee Writer" });

        await page.goto(`/index.html?v=${Date.now()}#/author/Dee%20Writer`);
        await expect(page.getByRole("heading", { level: 1, name: "Dee Writer" })).toBeVisible();
        await expect(page).toHaveTitle("Dee Writer · MyBookShelf");
        await expect(page.locator(".author-stat")).toHaveText(["3books", "2read", "—avg rating", "300pages read"]);

        const chip = page.locator(".series-chip");
        await expect(chip).toHaveCount(1);
        await expect(chip).toContainText("Dee Saga");
        await expect(chip).toContainText("2 of 3 books read");

        // Series books in reading order, then standalones.
        await expect(page.locator(".book-grid .book-tile h3")).toHaveText(["Saga One", "Saga Two", "A Standalone"]);
        await chip.click();
        await expect(page).toHaveURL(/#\/series\/Dee%20Saga$/);
        await expect(page.getByRole("heading", { level: 1, name: "Dee Saga" })).toBeVisible();
        await page.locator(".series-hero .by").getByRole("link", { name: "Dee Writer" }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Dee Writer" })).toBeVisible();
    });

    test("links to an author or series that isn't on the shelf say so", async ({ page, account }) => {
        void account;
        await page.goto("/index.html#/author/Nobody%20Here");
        await expect(page.getByRole("heading", { name: "Author not found" })).toBeVisible();
        await page.goto("/index.html#/series/No%20Such%20Series");
        await expect(page.getByRole("heading", { name: "Series not found" })).toBeVisible();
        // A broken link (bad % encoding) doesn't crash the page.
        await page.goto("/index.html#/author/%E0%A4%A");
        await expect(page.getByRole("heading", { name: "Author not found" })).toBeVisible();
        await page.getByRole("link", { name: "All authors" }).click();
        await expect(page.getByRole("heading", { name: "No authors yet" })).toBeVisible();
    });
});
