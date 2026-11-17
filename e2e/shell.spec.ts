import { test, expect } from "./fixtures";

// The app shell: nav tabs, hash routes and page titles. Runs against both the vanilla app
// (npm run test:e2e) and the React build (npm run test:e2e:react).
const TABS = ["Dashboard", "Library", "Authors", "Series", "Statistics", "Challenges", "Physical Books"];

test("the nav has every tab and follows the hash route", async ({ page, account }) => {
    void account;
    await page.goto("/index.html");
    await expect(page).toHaveURL(/#\/dashboard$/);
    await expect(page).toHaveTitle("Dashboard · MyBookShelf");

    const tabs = page.locator("nav.tabs .tab");
    await expect(tabs).toHaveText(TABS);

    for (const [label, hash, title] of [
        ["Library", "#/library", "Library"],
        ["Physical Books", "#/physical", "Physical Books"],
        ["Statistics", "#/statistics", "Statistics"]
    ]) {
        await tabs.filter({ hasText: label }).click();
        await expect(page).toHaveURL(new RegExp(`${hash}$`));
        await expect(page).toHaveTitle(`${title} · MyBookShelf`);
        await expect(tabs.filter({ hasText: label })).toHaveAttribute("aria-current", "page");
        await expect(page.locator("nav.tabs .tab[aria-current='page']")).toHaveCount(1);
    }

    await page.goto("/index.html?old=1#/stats"); // old link (a fresh load)
    await expect(page).toHaveURL(/#\/statistics$/);
});
