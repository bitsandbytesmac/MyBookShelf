import { test, expect, expectToast, dialog, today } from "./fixtures";
import type { Page } from "@playwright/test";
import type { Api } from "./fixtures";

// A shelf with series in every state the picker cares about.
async function seedSeries(api: Api) {
    for (let n = 1; n <= 5; n++) await api.createBook({ title: `HP ${n}`, series: "Harry Potter", seriesNumber: n, seriesTotal: 7 });
    for (let n = 1; n <= 3; n++) await api.createBook({ title: `Inheritance ${n}`, series: "The Inheritance Cycle", seriesNumber: n, seriesTotal: 4 });
    // Every place taken: 2 of 2 on the shelf (not read yet, so not Completed).
    await api.createBook({ title: "Full 1", series: "Full Saga", seriesNumber: 1, seriesTotal: 2 });
    await api.createBook({ title: "Full 2", series: "Full Saga", seriesNumber: 2, seriesTotal: 2 });
    // Completed (every book you added is read), though no total was ever set.
    await api.createBook({ title: "Done 1", series: "Done Duo", seriesNumber: 1, status: "Read", dateFinished: today() });
    // No total: always open while unfinished.
    await api.createBook({ title: "Open 1", series: "Open Ended", seriesNumber: 1 });
    // A novella doesn't take one of the total's places: 1 of 2 main books.
    await api.createBook({ title: "Nov 1", series: "Novella Saga", seriesNumber: 1, seriesTotal: 2 });
    await api.createBook({ title: "Nov 1.5", series: "Novella Saga", seriesNumber: 1.5, seriesTotal: 2 });
}

async function openEdit(page: Page, bookId: string) {
    // A query that changes every time forces a real reload, so books just made through the API are loaded.
    await page.goto(`/index.html?v=${Date.now()}#/book/${bookId}`);
    await page.getByRole("button", { name: "Edit details" }).click();
    return dialog(page, "Edit details");
}

const options = (page: Page) => page.getByRole("listbox", { name: "Series suggestions" }).getByRole("option");

test.describe("Series picker in Edit details", () => {
    test("lists only series that can still take a book, with their counts", async ({ page, api }) => {
        await seedSeries(api);
        const loose = await api.createBook({ title: "Loose Book" });
        const edit = await openEdit(page, loose.id);
        const field = edit.getByRole("combobox", { name: "Series" });

        await field.click();
        await expect(field).toHaveAttribute("aria-expanded", "true");
        await expect(options(page).locator(".combo-name")).toHaveText(["Harry Potter", "Novella Saga", "Open Ended", "The Inheritance Cycle"]);
        await expect(options(page).locator(".combo-count")).toHaveText(["5/7 books", "1/2 books", "1 book", "3/4 books"]);

        // Search narrows the list.
        await field.fill("pot");
        await expect(options(page).locator(".combo-name")).toHaveText(["Harry Potter", "Create series “pot”"]);

        // Keyboard: down + Enter picks it and fills in its total.
        await field.fill("inherit");
        await field.press("ArrowDown");
        await field.press("Enter");
        await expect(field).toHaveValue("The Inheritance Cycle");
        await expect(field).toHaveAttribute("aria-expanded", "false");
        await expect(edit.getByLabel("Books in series", { exact: true })).toHaveValue("4");
        await expect(edit.locator(".combo-hint")).toHaveText("The Inheritance Cycle · 3/4 books");

        // Escape closes the list, not the dialog.
        await field.press("ArrowDown");
        await expect(field).toHaveAttribute("aria-expanded", "true");
        await field.press("Escape");
        await expect(field).toHaveAttribute("aria-expanded", "false");
        await expect(edit).toBeVisible();

        await edit.getByLabel("Book #", { exact: true }).fill("4");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // Now 4 of 4: the series is full and drops out of the list for the next book.
        const another = await api.createBook({ title: "Another Loose Book" });
        const edit2 = await openEdit(page, another.id);
        await edit2.getByRole("combobox", { name: "Series" }).click();
        await expect(options(page).locator(".combo-name")).toHaveText(["Harry Potter", "Novella Saga", "Open Ended"]);

        await page.goto("/index.html#/series");
        await expect(page.locator(".series-card", { hasText: "The Inheritance Cycle" })).toContainText("0/4 read");
    });

    test("creates a new series from a typed name, which then shows on the Series page and in the list", async ({ page, api }) => {
        const first = await api.createBook({ title: "Saga Start" });
        const edit = await openEdit(page, first.id);
        const field = edit.getByRole("combobox", { name: "Series" });

        await field.fill("  Moon   Chronicles ");
        await expect(options(page)).toHaveCount(1);
        await options(page).first().click();
        await expect(field).toHaveValue("Moon Chronicles");
        await expect(edit.locator(".combo-hint")).toHaveText("New series: “Moon Chronicles” is created when you save.");
        await edit.getByLabel("Book #", { exact: true }).fill("1");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        await page.goto("/index.html#/series");
        await expect(page.locator(".series-card", { hasText: "Moon Chronicles" })).toHaveCount(1);

        const second = await api.createBook({ title: "Saga Middle" });
        const edit2 = await openEdit(page, second.id);
        await edit2.getByRole("combobox", { name: "Series" }).click();
        await expect(options(page).locator(".combo-name")).toHaveText(["Moon Chronicles"]);
        await expect(options(page).locator(".combo-count")).toHaveText(["1 book"]);
    });

    test("never creates a duplicate: other capitalisation or spacing joins the existing series", async ({ page, api }) => {
        await seedSeries(api);
        const a = await api.createBook({ title: "Dup A" });
        let edit = await openEdit(page, a.id);
        let field = edit.getByRole("combobox", { name: "Series" });
        await field.fill("  harry   POTTER ");
        await expect(options(page).locator(".combo-name")).toHaveText(["Harry Potter"]); // no "Create series"
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // A full series isn't offered, but typing its exact name still joins it rather than making a second one.
        const b = await api.createBook({ title: "Dup B" });
        edit = await openEdit(page, b.id);
        field = edit.getByRole("combobox", { name: "Series" });
        await field.fill("full saga");
        await expect(options(page)).toHaveCount(0);
        await expect(edit.locator(".combo-hint")).toHaveText("“Full Saga” already has all 2 books. This book will still be added to it.");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        await page.goto("/index.html#/series");
        await expect(page.locator(".series-card", { hasText: /Harry Potter/i })).toHaveCount(1);
        await expect(page.locator(".series-card", { hasText: /Full Saga/i })).toHaveCount(1);
        const books = (await (await page.request.get("/api/books")).json()).data as { title: string; series: string }[];
        expect(books.find((x) => x.title === "Dup A")!.series).toBe("Harry Potter");
        expect(books.find((x) => x.title === "Dup B")!.series).toBe("Full Saga");
    });

    test("a book in a full or completed series keeps it, and editing one book leaves the others alone", async ({ page, api }) => {
        await seedSeries(api);
        const books = (await (await page.request.get("/api/books")).json()).data as { id: string; title: string; series: string }[];
        const full2 = books.find((b) => b.title === "Full 2")!;

        const edit = await openEdit(page, String(full2.id));
        const field = edit.getByRole("combobox", { name: "Series" });
        await expect(field).toHaveValue("Full Saga");
        await field.click();
        // Its own series is offered even though it's full; other full/completed ones aren't.
        await expect(options(page).locator(".combo-name")).toHaveText(["Full Saga", "Harry Potter", "Novella Saga", "Open Ended", "The Inheritance Cycle"]);
        await field.press("Escape");
        await edit.getByLabel("Title", { exact: true }).fill("Full 2 (renamed)");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // Move it to another series: only this book moves.
        await page.getByRole("button", { name: "Edit details" }).click();
        await dialog(page, "Edit details").getByRole("combobox", { name: "Series" }).fill("Open Ended");
        await dialog(page, "Edit details").getByRole("button", { name: "Save changes" }).click();
        // The first save's toast may still be showing, so wait for this save to finish (the dialog closes).
        await expect(dialog(page, "Edit details")).toBeHidden();

        const after = (await (await page.request.get("/api/books")).json()).data as { title: string; series: string; series_total: number | null }[];
        const byTitle = Object.fromEntries(after.map((b) => [b.title, b]));
        expect(byTitle["Full 2 (renamed)"].series).toBe("Open Ended");
        expect(byTitle["Full 1"].series).toBe("Full Saga");
        expect(byTitle["Full 1"].series_total).toBe(2);
        expect(byTitle["HP 1"].series).toBe("Harry Potter");
        expect(byTitle["Open 1"].series).toBe("Open Ended");

        await page.goto("/index.html#/series");
        await expect(page.locator(".series-card", { hasText: "Full Saga" })).toContainText("0/2 read");
        await expect(page.locator(".series-card", { hasText: "Open Ended" })).toContainText("0/2 read");
    });
});
