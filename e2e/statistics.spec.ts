import { test, expect, today } from "./fixtures";

test.describe("Statistics", () => {
    test("has its own tab with a summary row, books per month, genres and completion", async ({ page, api }) => {
        await api.createBook({ title: "F1", genres: ["Fantasy"], status: "Read", dateFinished: today() });
        await api.createBook({ title: "F2", genres: ["Fantasy", "Romance"], status: "Read", dateFinished: today() });
        await api.createBook({ title: "M1", genres: ["Mystery"], status: "Read", dateFinished: today() });
        // Two rated books: 5 and 4 stars, average 4.5.
        for (const [title, rating] of [["Rated 5", 5], ["Rated 4", 4]] as const) {
            await page.request.post("/api/books", { data: { title, author: "R", status: "Read", rating, dateFinished: today(), genres: [], subgenres: [], quotes: [] } });
        }

        await page.goto("/index.html#/dashboard");
        await page.getByRole("link", { name: "Statistics" }).click();
        await expect(page).toHaveURL(/#\/statistics$/);
        await expect(page).toHaveTitle("Statistics · MyBookShelf");
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Statistics");

        const tiles = page.locator(".stat-tile");
        await expect(tiles.locator(".dash-stat-label")).toHaveText(["Finished this year", "Pages this month", "Average rating", "Reading streak"]);
        await expect(tiles.nth(0).locator(".dash-stat-value")).toHaveText("5");
        await expect(tiles.nth(2).locator(".dash-stat-value")).toHaveText("4.5");
        await expect(tiles.nth(2)).toContainText("from 2 rated books");

        await expect(page.getByRole("heading", { name: "Books read" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Average completion" })).toBeVisible();

        // Genre chart: vertical bars side by side on one baseline.
        const genres = page.locator("section.card", { has: page.getByRole("heading", { name: "Genres you've read" }) });
        const bars = genres.locator(".vbar");
        await expect(bars).toHaveCount(3);
        await expect(bars.first()).toHaveAttribute("aria-label", "Fantasy: 2 books");
        const tallest = await genres.locator(".vbar-fill").first().boundingBox();
        const shorter = await genres.locator(".vbar-fill").nth(1).boundingBox();
        expect(tallest!.height).toBeGreaterThan(tallest!.width);
        expect(shorter!.height).toBeCloseTo(tallest!.height / 2, -1);
        expect(Math.abs(tallest!.y + tallest!.height - (shorter!.y + shorter!.height))).toBeLessThan(2);
        await expect(genres.locator(".vbar-label")).toHaveText(["Fantasy", "Mystery", "Romance"]);
    });

    test("the old #/stats link opens Statistics", async ({ page, account }) => {
        void account;
        await page.goto("/index.html#/stats");
        await expect(page).toHaveURL(/#\/statistics$/);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("Statistics");
    });
});
