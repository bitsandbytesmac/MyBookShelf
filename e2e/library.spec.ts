import { test, expect, today } from "./fixtures";

test.describe("Library Book Shelf", () => {
    test("every book stands on the shelf; tabs, search and the Shelf/Grid switch all work", async ({ page, api }) => {
        await api.createBook({ title: "Halfway There", status: "Reading", totalPages: 200, currentPage: 100 });
        await api.createBook({ title: "Finished Tale", status: "Read", dateFinished: today() });
        const fav = await api.createBook({ title: "Waiting Patiently" });
        // Mark one as a favourite (full-replacement PUT).
        await page.request.put(`/api/books/${fav.id}`, { data: { title: "Waiting Patiently", author: "Test Author", status: "To Be Read", isFavorite: true, genres: [], subgenres: [], quotes: [] } });

        await page.goto("/index.html#/library");
        const shelf = page.locator(".bookcase");
        await expect(page.getByRole("button", { name: "Shelf" })).toHaveAttribute("aria-pressed", "true");
        await expect(shelf.locator(".shelf-book")).toHaveCount(3);

        // Each book says what it is; reading books show progress, favourites a heart.
        const halfway = shelf.getByRole("link", { name: /^Halfway There/ });
        await expect(halfway).toHaveAttribute("aria-label", "Halfway There · Test Author · Reading · 50%");
        await expect(halfway.locator(".shelf-progress span")).toHaveAttribute("style", /width: 50%/);
        await expect(shelf.getByRole("link", { name: /^Waiting Patiently/ }).locator(".shelf-fav")).toBeVisible();
        await expect(shelf.getByRole("link", { name: /^Finished Tale/ })).toHaveAttribute("aria-label", /finished/);

        // Status tabs and search filter the shelf.
        await page.getByRole("tab", { name: /^Read\s*\d/ }).click(); // not "Reading"
        await expect(shelf.locator(".shelf-book")).toHaveCount(1);
        await page.getByRole("tab", { name: /^All/ }).click();
        await page.getByRole("searchbox", { name: "Search library" }).fill("halfway");
        await expect(shelf.locator(".shelf-book")).toHaveCount(1);
        await page.getByRole("searchbox", { name: "Search library" }).fill("");

        // Grid shows the detailed tiles, and the choice is remembered.
        await page.getByRole("button", { name: "Grid" }).click();
        await expect(page.locator(".book-grid .book-tile")).toHaveCount(3);
        await expect(page.locator(".bookcase")).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".book-grid .book-tile")).toHaveCount(3);
        await page.getByRole("button", { name: "Shelf" }).click();
        await expect(shelf.locator(".shelf-book")).toHaveCount(3);

        // A book on the shelf opens its page.
        await halfway.click();
        await expect(page.getByRole("heading", { level: 1, name: "Halfway There" })).toBeVisible();
    });
});
