import { test, expect, expectToast, dialog } from "./fixtures";

test.describe("Books", () => {
    test("manual add starts with blank series boxes and opens the new book", async ({ page, account }) => {
        void account;
        await page.goto("/index.html#/library");
        await page.getByRole("button", { name: "Add a book" }).first().click();
        await dialog(page, "Add a book").getByRole("button", { name: "Can't find it? Add manually" }).click();

        const add = dialog(page, "Add a book manually");
        // Series number boxes are empty: no value and no look-alike sample number.
        for (const label of ["Book #", "Books in series"]) {
            const box = add.getByLabel(label, { exact: true });
            await expect(box).toHaveValue("");
            await expect(box).not.toHaveAttribute("placeholder", /\d/);
        }

        await add.getByLabel("Title").fill("The Manual Book");
        await add.getByLabel("Author").fill("Jo Writer");
        await add.getByRole("button", { name: "Add to To Be Read" }).click();

        await expectToast(page, `"The Manual Book" added to your To Be Read`);
        await expect(page).toHaveURL(/#\/book\/\d+/);
        await expect(page.getByRole("heading", { level: 1, name: "The Manual Book" })).toBeVisible();
    });

    test("a book added while the shelf is still loading isn't lost when the load finishes", async ({ page, account }) => {
        void account;
        // Hold the first GET /api/books until the new book has been saved (a slow connection).
        let release!: () => void;
        const held = new Promise<void>((resolve) => (release = resolve));
        let first = true;
        await page.route("**/api/books", async (route) => {
            if (route.request().method() === "GET" && first) {
                first = false;
                const response = await route.fetch(); // fetched now: the shelf is still empty
                await held;
                return route.fulfill({ response });
            }
            return route.continue();
        });

        await page.goto("/index.html#/library");
        await page.locator("[data-action='add-book']").click(); // the nav button works before the shelf has loaded
        await dialog(page, "Add a book").getByRole("button", { name: "Can't find it? Add manually" }).click();
        const add = dialog(page, "Add a book manually");
        await add.getByLabel("Title").fill("Early Bird");
        await add.getByLabel("Author").fill("Quick Reader");
        await add.getByRole("button", { name: "Add to To Be Read" }).click();
        await expect(page).toHaveURL(/#\/book\/\d+/);

        release(); // the stale, empty list arrives after the book was added
        await expect(page.getByRole("heading", { level: 1, name: "Early Bird" })).toBeVisible();
        await page.getByRole("link", { name: "Library" }).first().click();
        await expect(page.locator(".bookcase").getByRole("link", { name: /^Early Bird/ })).toHaveCount(1);
    });

    test("edit details saves age category, tropes, content warnings and series total", async ({ page, api }) => {
        const book = await api.createBook({ title: "Thorns", series: "Court", seriesNumber: 1, totalPages: 400 });
        await page.goto(`/index.html#/book/${book.id}`);
        await page.getByRole("button", { name: "Edit details" }).click();

        const edit = dialog(page, "Edit details");
        await expect(edit.getByLabel("Books in series", { exact: true })).toHaveValue("");

        // Genres, sub-genres, tropes and warnings all fold away, closed by default.
        const folds = edit.locator("details.foldout");
        await expect(folds.locator("summary")).toHaveText([/^Genres/, /^Sub-genres/, /^Tropes/, /^Trigger \/ content warnings/]);
        for (const fold of await folds.all()) await expect(fold).not.toHaveAttribute("open");

        await edit.getByLabel("Books in series", { exact: true }).fill("5");
        await edit.getByLabel("Age category").selectOption("New Adult");

        await folds.locator("summary", { hasText: "Genres" }).first().click();
        await edit.getByRole("group", { name: "Genres" }).getByRole("button", { name: "Fantasy" }).click();
        await expect(folds.locator("summary", { hasText: /^Genres/ }).first()).toContainText("1 selected");

        await folds.locator("summary", { hasText: "Tropes" }).click();
        const tropes = edit.getByRole("group", { name: "Tropes" });
        await tropes.getByRole("button", { name: "Enemies to Lovers" }).click();
        await tropes.getByRole("button", { name: "Slow Burn" }).click();
        // A custom trope added with Enter also updates the count.
        const customTrope = edit.getByLabel("Tropes: add your own");
        await customTrope.fill("Bargain with a Fae");
        await customTrope.press("Enter");
        await expect(folds.locator("summary", { hasText: "Tropes" })).toContainText("3 selected");

        await folds.locator("summary", { hasText: "content warnings" }).click();
        await edit.getByRole("group", { name: "Content warnings" }).getByRole("button", { name: "Violence", exact: true }).click();

        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(edit).toBeHidden();

        const hero = page.locator(".book-hero");
        await expect(hero.getByText("New Adult", { exact: true })).toBeVisible();
        await expect(hero.locator(".badge.trope")).toHaveText(["Enemies to Lovers", "Slow Burn", "Bargain with a Fae"]);
        await expect(page.getByRole("link", { name: "Court · Book 1 of 5" }).first()).toBeVisible();

        // Content warnings stay hidden until asked for.
        const details = page.locator(".detail-list");
        const cw = details.locator("details.cw-reveal");
        await expect(cw.locator("summary")).toHaveText("Show 1 warning");
        await expect(cw.getByText("Violence")).toBeHidden();
        await cw.locator("summary").click();
        await expect(cw.getByText("Violence")).toBeVisible();

        // Everything survives a reload (it came from the server, not just local state).
        await page.reload();
        await expect(page.locator(".book-hero .badge.trope")).toHaveCount(3);
        await expect(page.locator(".detail-list")).toContainText("New Adult");
    });

    test("review and reading-journal checkboxes save straight away", async ({ page, api }) => {
        const book = await api.createBook({ title: "Checked Book" });
        await page.goto(`/index.html#/book/${book.id}`);

        const review = page.getByRole("checkbox", { name: /^Review/ });
        const journal = page.getByRole("checkbox", { name: /^Reading journal/ });
        await expect(review).not.toBeChecked();
        await expect(journal).not.toBeChecked();

        await review.click();
        await expectToast(page, "Review ticked off");
        await journal.click();
        await expectToast(page, "Reading journal ticked off");

        await page.reload();
        await expect(page.getByRole("checkbox", { name: /^Review/ })).toBeChecked();
        await expect(page.getByRole("checkbox", { name: /^Reading journal/ })).toBeChecked();

        // The Review dialog shows the same boxes, and unticking there saves too.
        await page.getByRole("button", { name: "Write review" }).click();
        const dlg = dialog(page, /^Review · /);
        await expect(dlg.getByRole("checkbox", { name: /^Review/ })).toBeChecked();
        await dlg.getByRole("checkbox", { name: /^Reading journal/ }).uncheck();
        await dlg.getByRole("button", { name: "Save review" }).click();
        await expectToast(page, "Review saved");
        await expect(page.getByRole("checkbox", { name: /^Reading journal/ })).not.toBeChecked();
    });

    test("edit details rejects an invalid series total", async ({ page, api }) => {
        const book = await api.createBook({ title: "No Series" });
        await page.goto(`/index.html#/book/${book.id}`);
        await page.getByRole("button", { name: "Edit details" }).click();
        const edit = dialog(page, "Edit details");

        await edit.getByLabel("Books in series", { exact: true }).fill("4");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expect(edit.locator(".form-error")).toHaveText("Add the series name, or clear the number of books in it.");

        await edit.getByLabel("Series", { exact: true }).fill("Some Series");
        await edit.getByLabel("Books in series", { exact: true }).fill("2.5");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expect(edit.locator(".form-error")).toHaveText("Books in series must be a whole number from 1 to 999.");
    });
});
