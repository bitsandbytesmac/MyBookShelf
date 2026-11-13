import { test, expect, expectToast, dialog, today } from "./fixtures";

test.describe("Series progress", () => {
    test("shows read X of the series total with a percent bar, and the total follows the series", async ({ page, api }) => {
        await api.createBook({ title: "Saga One", series: "Star Saga", seriesNumber: 1, status: "Read", dateFinished: today() });
        await api.createBook({ title: "Saga Novella", series: "Star Saga", seriesNumber: 1.5, status: "Read", dateFinished: today() });
        const two = await api.createBook({ title: "Saga Two", series: "Star Saga", seriesNumber: 2 });

        // Without a total, progress counts the books on the shelf (both finished books count).
        await page.goto("/index.html#/series");
        const card = page.locator(".series-card", { hasText: "Star Saga" });
        await expect(card).toContainText("2/3 read · 67%");

        // Set "Books in series" on one book…
        await page.goto(`/index.html#/book/${two.id}`);
        await page.getByRole("button", { name: "Edit details" }).click();
        const edit = dialog(page, "Edit details");
        await edit.getByLabel("Books in series", { exact: true }).fill("6");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // …and the series shows 1/6: the novella (#1.5) doesn't count toward the 6.
        await page.goto("/index.html#/series");
        await expect(card).toContainText("1/6 read · 17%");
        await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "17");

        await card.click();
        const hero = page.locator(".series-hero");
        await expect(hero.locator(".series-big")).toHaveText("1/6 books read");
        await expect(hero.locator(".series-pct")).toHaveText("17%");
        await expect(hero).toContainText("5 books to go · 4 books not on your shelf yet");

        // The total was copied to the other books in the series (server-side), so it survives a reload.
        await page.reload();
        await expect(page.locator(".series-hero .series-big")).toHaveText("1/6 books read");
        await page.locator(".series-row", { hasText: "Saga One" }).click();
        await expect(page.getByRole("link", { name: "Star Saga · Book 1 of 6" }).first()).toBeVisible();
    });

    test("typing an existing series name fills in its total", async ({ page, api }) => {
        await api.createBook({ title: "Duo One", series: "Duology", seriesNumber: 1, seriesTotal: 2 });
        const loose = await api.createBook({ title: "Duo Two" });

        await page.goto(`/index.html#/book/${loose.id}`);
        await page.getByRole("button", { name: "Edit details" }).click();
        const edit = dialog(page, "Edit details");
        await edit.getByLabel("Series", { exact: true }).fill("duology");
        await expect(edit.getByLabel("Books in series", { exact: true })).toHaveValue("2");
        await edit.getByLabel("Book #", { exact: true }).fill("2");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        await page.goto("/index.html#/series");
        await expect(page.locator(".series-card")).toHaveCount(1); // "duology" joined "Duology"
        await expect(page.locator(".series-card")).toContainText("0/2 read · 0%");
    });
});
