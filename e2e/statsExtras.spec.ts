import { test, expect, expectToast, dialog, today } from "./fixtures";

// Statistics details: chart tooltips, the Reading Recap's "Try again", and the recap picking up a new
// journal entry. Runs against the vanilla app and the React build. The failed load is simulated in the
// browser (page.route), so nothing leaves this machine.

const recap = (page: import("@playwright/test").Page) => page.locator("section.recap");

test.describe("Statistics details", () => {
    test("chart bars show a tooltip with the exact count", async ({ page, api }) => {
        await api.createBook({ title: "Done Deal", status: "Read", dateFinished: today(), genres: ["Fantasy"] });
        await page.goto(`/index.html?v=${Date.now()}#/statistics`);
        const month = new Date().toLocaleDateString("en-US", { month: "short" });
        const year = new Date().getFullYear();

        await page.locator(".months .month.current").hover();
        await expect(page.locator(".tooltip")).toBeVisible();
        await expect(page.locator(".tooltip")).toHaveText(`${month} ${year}: 1 book`);
        await page.locator(".vbars .vbar").first().hover();
        await expect(page.locator(".tooltip")).toHaveText("Fantasy: 1 book");
        await page.locator("h1").hover();
        await expect(page.locator(".tooltip")).toBeHidden();
    });

    test("the recap offers Try again when a month fails to load", async ({ page, account }) => {
        void account;
        let failures = 1;
        await page.route("**/api/activities/recap?month=*", async (route) => {
            if (failures-- > 0) return route.fulfill({ status: 500, json: { status: "error", message: "Server hiccup." } });
            return route.continue();
        });
        await page.goto("/index.html#/statistics");
        const alert = recap(page).getByRole("alert");
        await expect(alert).toContainText("Server hiccup.");
        await alert.getByRole("button", { name: "Try again" }).click();
        await expect(recap(page).getByRole("alert")).toHaveCount(0);
        await expect(recap(page).locator(".recap-summary")).toContainText("Nothing logged in");
    });

    test("a new journal entry shows up in the recap without a reload", async ({ page, api }) => {
        await api.createBook({ title: "Recap Me", status: "Reading", totalPages: 50, currentPage: 5 });
        await page.goto(`/index.html?v=${Date.now()}#/statistics`);
        await expect(recap(page).locator(".recap-summary")).toContainText("Nothing logged in");

        // Log on the book page, then come back through the nav (no reload).
        await page.getByRole("link", { name: "Library" }).first().click();
        await page.locator(".bookcase").getByRole("link", { name: /^Recap Me/ }).click();
        await page.locator(".session-log").click();
        const log = dialog(page, "Log your reading");
        await log.getByLabel("Page I'm on").fill("12");
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Saved to your journal");

        await page.getByRole("link", { name: "Statistics" }).first().click();
        await expect(recap(page).locator(".recap-summary")).toContainText("Read on 1 day · 7 pages");
        await expect(recap(page).locator(`button[data-focus="day-${today()}"]`)).toHaveClass(/is-read/);
        await expect(recap(page).locator(".recap-entry")).toContainText("+7 pages · p. 5 → 12 of 50 (24%)");
    });
});
