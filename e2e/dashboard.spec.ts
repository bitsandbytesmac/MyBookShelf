import { test, expect, expectToast, dialog, today } from "./fixtures";

test.describe("Dashboard", () => {
    test("genre statistics are vertical bars", async ({ page, api }) => {
        await api.createBook({ title: "F1", genres: ["Fantasy"], status: "Read", dateFinished: today() });
        await api.createBook({ title: "F2", genres: ["Fantasy", "Romance"], status: "Read", dateFinished: today() });
        await api.createBook({ title: "M1", genres: ["Mystery"], status: "Read", dateFinished: today() });

        await page.goto("/index.html#/dashboard");
        const card = page.locator("section.card", { has: page.getByRole("heading", { name: "Genres you've read" }) });
        const bars = card.locator(".vbar");
        await expect(bars).toHaveCount(3);
        await expect(bars.first()).toHaveAttribute("aria-label", "Fantasy: 2 books");

        // Tallest bar fills its column top to bottom; the bars sit side by side in one row.
        const tallest = await card.locator(".vbar-fill").first().boundingBox();
        const shorter = await card.locator(".vbar-fill").nth(1).boundingBox();
        expect(tallest && shorter).toBeTruthy();
        expect(tallest!.height).toBeGreaterThan(tallest!.width);
        expect(shorter!.height).toBeCloseTo(tallest!.height / 2, -1);
        expect(Math.abs(tallest!.y + tallest!.height - (shorter!.y + shorter!.height))).toBeLessThan(2); // same baseline
        expect(shorter!.x).toBeGreaterThan(tallest!.x);
        await expect(card.locator(".vbar-label")).toHaveText(["Fantasy", "Mystery", "Romance"]);
    });

    test("custom reading goals can be added, edited and deleted", async ({ page, api }) => {
        await api.createBook({ title: "Classic One", genres: ["Classics"], status: "Read", dateFinished: today(), totalPages: 250 });
        await api.createBook({ title: "Not Classic", genres: ["Thriller"], status: "Read", dateFinished: today(), totalPages: 300 });

        await page.goto("/index.html#/dashboard");
        const section = page.locator("section.section", { has: page.getByRole("heading", { name: "My goals" }) });
        await expect(section).toContainText("Set a goal like");

        await section.getByRole("button", { name: "Add goal" }).click();
        const add = dialog(page, "Add a reading goal");
        await add.getByLabel("Target").fill("3");
        await add.getByLabel("Count", { exact: true }).selectOption("books");
        await add.getByLabel("When").selectOption("year");
        await expect(add.getByLabel("Which one")).toBeHidden();
        await add.getByLabel("Only count").selectOption("genre");
        await add.getByLabel("Which one").selectOption("Classics");
        await add.getByRole("button", { name: "Add goal" }).click();
        await expectToast(page, "Goal added");

        const goal = section.locator(".custom-goal");
        await expect(goal.locator("h3")).toHaveText("3 Classics books this year");
        await expect(goal.locator(".goal-number")).toHaveText("1 / 3 books");
        await expect(goal).toContainText("2 books to go · 33%");

        // Switch it to a pages goal for the month, with its own name.
        await goal.getByRole("button", { name: /^Edit goal/ }).click();
        const edit = dialog(page, "Edit goal");
        await expect(edit.getByLabel("Target")).toHaveValue("3");
        await edit.getByLabel("Name").fill("Page sprint");
        await edit.getByLabel("Count", { exact: true }).selectOption("pages");
        await edit.getByLabel("Target").fill("500");
        await edit.getByLabel("When").selectOption("month");
        await edit.getByLabel("Only count").selectOption("");
        await edit.getByRole("button", { name: "Save goal" }).click();
        await expectToast(page, "Goal saved");
        await expect(goal.locator("h3")).toHaveText("Page sprint");
        await expect(goal.locator(".goal-number")).toHaveText("550 / 500 pages");
        await expect(goal).toContainText("Goal reached!");
        await expect(goal).toHaveClass(/is-done/);

        // Bad input is caught before saving.
        await section.getByRole("button", { name: "Add goal" }).click();
        const bad = dialog(page, "Add a reading goal");
        await bad.getByLabel("Target").fill("0");
        await bad.getByRole("button", { name: "Add goal" }).click();
        await expect(bad.locator(".form-error")).toContainText("Target must be a whole number");
        await bad.getByRole("button", { name: "Cancel" }).click();

        await page.reload();
        await expect(goal.locator("h3")).toHaveText("Page sprint");

        await goal.getByRole("button", { name: /^Delete goal/ }).click();
        await dialog(page, "Delete this goal?").getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Goal deleted");
        await expect(goal).toHaveCount(0);
    });
});
