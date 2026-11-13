import { test, expect, today } from "./fixtures";

// Runs in the "mobile" project (Pixel 7 viewport): every page must fit the screen width,
// and the five tabs must fit in the bottom bar.

test("pages fit a phone screen and the bottom nav shows all five tabs", async ({ page, api }) => {
    const book = await api.createBook({
        title: "A Very Long Title That Keeps Going To Test Wrapping On Small Screens",
        series: "Narrow Saga", seriesNumber: 1, seriesTotal: 4, genres: ["Science Fiction", "Literary Fiction"],
        status: "Read", dateFinished: today()
    });
    const challenge = await api.createChallenge("Phone Challenge", [
        { label: "A" }, { label: "A book with an extremely long prompt that should wrap neatly", bookId: book.id }
    ]);

    const routes = ["#/dashboard", "#/library", `#/book/${book.id}`, "#/series", "#/series/Narrow%20Saga", "#/challenges", `#/challenges/${challenge.id}`];
    for (const route of routes) {
        await page.goto(`/index.html${route}`);
        await expect(page.locator("#view > *").first()).toBeVisible();
        await expect(page.locator(".skeleton")).toHaveCount(0);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `horizontal scroll on ${route}`).toBeLessThanOrEqual(0);
    }

    const tabs = page.locator("nav.tabs .tab");
    await expect(tabs).toHaveText(["Dashboard", "Library", "Authors", "Series", "Challenges"]);
    for (const tab of await tabs.all()) {
        const box = await tab.boundingBox();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    }
    await tabs.filter({ hasText: "Challenges" }).click();
    await expect(page).toHaveURL(/#\/challenges$/);
    await expect(tabs.filter({ hasText: "Challenges" })).toHaveAttribute("aria-current", "page");
});

test("edit details fits a phone screen with the new sections", async ({ page, api }) => {
    const book = await api.createBook({ title: "Phone Edit", series: "S", seriesNumber: 1 });
    await api.createChallenge("A challenge with a rather long name for a phone", [{ label: "A" }]);
    await page.goto(`/index.html#/book/${book.id}`);
    await page.getByRole("button", { name: "Edit details" }).click();

    const edit = page.getByRole("dialog", { name: "Edit details" });
    for (const label of ["Series", "Book #", "Books in series"]) await expect(edit.getByLabel(label, { exact: true })).toBeVisible();
    await edit.locator("summary", { hasText: "Tropes" }).click();
    await edit.getByLabel("Prompt in A challenge with a rather long name for a phone", { exact: true }).scrollIntoViewIfNeeded();

    const overflow = await edit.evaluate((d) => d.querySelector(".dialog-body")!.scrollWidth - d.querySelector(".dialog-body")!.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
});
