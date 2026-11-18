import { test, expect, expectToast, dialog, today } from "./fixtures";
import type { Page } from "@playwright/test";

// More of the challenge pages and dialogs. Runs against the vanilla app and the React build.
// "Find new books" is answered inside the browser with made-up results (page.route), so the test never
// reaches the server's Google Books endpoint or spends the quota.

async function openChallenges(page: Page) {
    await page.goto(`/index.html?v=${Date.now()}#/challenges`);
    await expect(page.getByRole("heading", { level: 1, name: "Challenges" })).toBeVisible();
}

test.describe("Challenge extras", () => {
    test("my own spots: create, pick a book by hand, edit, remove a spot, delete", async ({ page, api }) => {
        await api.createBook({ title: "Seaside Story", status: "Read", dateFinished: today() });
        await api.createBook({ title: "Mountain Tale" });
        await openChallenges(page);
        await page.getByRole("button", { name: "New challenge" }).click();

        const create = dialog(page, "New challenge");
        await create.getByLabel("Start from").selectOption("custom");
        await expect(create.getByLabel("Challenge title")).toHaveValue("");
        await create.getByRole("button", { name: "Create challenge" }).click();
        await expect(create.locator(".form-error")).toHaveText("Give your challenge a title.");
        await create.getByLabel("Challenge title").fill("Holiday Reads");
        await create.getByRole("button", { name: "Create challenge" }).click();
        await expect(create.locator(".form-error")).toHaveText("Add at least one spot.");
        await create.getByLabel("Spots", { exact: true }).fill("A book by the sea\n\nA mountain book\n");
        await create.getByLabel("Starts").fill("");
        await create.getByLabel("Ends").fill("");
        await create.getByRole("button", { name: "Create challenge" }).click();
        await expectToast(page, "Challenge created");
        await expect(page.getByRole("heading", { level: 1, name: "Holiday Reads" })).toBeVisible();
        await expect(page).toHaveTitle("Holiday Reads · MyBookShelf");
        await expect(page.locator(".board-dates")).toContainText("No end date");
        await expect(page.locator(".board-slot .slot-rules")).toHaveText(["You pick", "You pick"]);

        // A spot without rules is filled by hand.
        await page.getByRole("button", { name: /^A book by the sea, no book yet/ }).click();
        const spot = dialog(page, "A book by the sea");
        await expect(spot.locator(".rule-chip")).toHaveText("Chosen by hand");
        await spot.getByLabel("Choose the book for this spot").selectOption({ label: "Seaside Story — Test Author" });
        await spot.getByRole("button", { name: "Use" }).click();
        await expectToast(page, "Book added to the spot");
        await expect(page.locator(".board-count")).toHaveText("1/2 · 50%");

        // Edit the challenge.
        await page.getByRole("button", { name: "Edit" }).first().click();
        const edit = dialog(page, "Edit challenge");
        await edit.getByLabel("Challenge title").fill("Summer Reads");
        await edit.getByLabel("Match books automatically").uncheck();
        await edit.getByRole("button", { name: "Save" }).click();
        await expectToast(page, "Challenge saved");
        await expect(page.getByRole("heading", { level: 1, name: "Summer Reads" })).toBeVisible();
        await expect(page.locator(".board-dates")).toContainText("automatic matching off");

        // Remove a spot (asks first).
        await page.getByRole("button", { name: /^A mountain book/ }).click();
        await dialog(page, "A mountain book").getByRole("button", { name: "Remove spot" }).click();
        await dialog(page, "Remove this spot?").getByRole("button", { name: "Remove" }).click();
        await expectToast(page, "Spot removed");
        await expect(page.locator(".board-slot .slot-label")).toHaveText(["A book by the sea", "New spot"]);
        await expect(page.locator(".board-done")).toHaveText("Challenge complete! 🎉");

        // The last spot can't be removed.
        await page.getByRole("button", { name: /^A book by the sea/ }).click();
        await dialog(page, "A book by the sea").getByRole("button", { name: "Remove spot" }).click();
        await expectToast(page, "A challenge needs at least one spot.");
        await dialog(page, "A book by the sea").getByRole("button", { name: "Close" }).click();

        // Delete the whole challenge.
        await page.getByRole("button", { name: "Delete challenge" }).click();
        await dialog(page, "Delete this challenge?").getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Challenge deleted");
        await expect(page).toHaveURL(/#\/challenges$/);
        await expect(page.getByRole("heading", { name: "No challenges yet" })).toBeVisible();
    });

    test("a planned book's spot opens from the book page; Find new books adds an idea to the TBR", async ({ page, api }) => {
        const book = await api.createBook({ title: "Dragon Days", genres: ["Fantasy"] });
        await api.createChallenge("Genre Mix", [{ label: "Fantasy", bookId: book.id }, { label: "Anything" }]);
        await page.route("**/api/google-books/search**", (route) => route.fulfill({
            json: {
                status: "success",
                data: [
                    { id: "x", volumeInfo: { title: "Dragon Days", authors: ["Test Author"] } }, // already on the shelf: left out
                    { id: "y", volumeInfo: { title: "Brand New Idea", authors: ["Fresh Writer"], publishedDate: "2021", categories: ["Fantasy"] } }
                ]
            }
        }));

        await page.goto(`/index.html?v=${Date.now()}#/book/${book.id}`);
        const spots = page.locator(".challenge-spots");
        await expect(spots).toContainText("In your challenges");
        await spots.getByRole("button", { name: "Planned" }).click();
        const panel = dialog(page, "Fantasy");
        await expect(panel.locator(".spot-current")).toContainText("In this spot · planned");
        await panel.getByRole("button", { name: "Close" }).click();

        // "Anything" has no book: find a new one for it.
        await page.goto(`/index.html?v=${Date.now()}#/challenges`);
        await page.locator(".challenge-card").first().click();
        await page.getByRole("button", { name: /^Anything, no book yet/ }).click();
        const anything = dialog(page, "Anything");
        await anything.getByRole("button", { name: "Find new books for this spot" }).click();
        const ideas = anything.locator(".spot-ideas .match-row");
        await expect(ideas).toHaveCount(1);
        await expect(ideas).toContainText("Brand New Idea");
        await expect(ideas).toContainText("Fresh Writer · 2021");
        await ideas.getByRole("button", { name: "Add to TBR" }).click();
        await expectToast(page, `"Brand New Idea" added to your TBR and planned for this spot`);
        await expect(anything).toBeHidden();
        await expect(page.getByRole("button", { name: /^Anything, Brand New Idea, planned/ })).toBeVisible();
    });
});
