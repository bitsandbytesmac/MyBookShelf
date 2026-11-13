import { test, expect, expectToast, dialog, type Api } from "./fixtures";
import type { Page } from "@playwright/test";

const RAINBOW = ["Red", "Orange", "Yellow", "Green", "Dark Blue", "Light Blue", "Purple", "Pink", "White", "Black", "Brown", "Grey"];

const slots = (page: Page) => page.locator(".board-slots > li");
const slotButton = (page: Page, label: string) => slots(page).filter({ has: page.locator(".slot-label", { hasText: new RegExp(`^${label}$`) }) }).locator(".slot-btn");

async function openBoard(page: Page, api: Api, name: string, labels: string[], description = "") {
    const { id } = await api.createChallenge(name, labels.map((label) => ({ label })));
    if (description) await page.request.put(`/api/challenges/${id}`, { data: { name, description, items: labels.map((label) => ({ label })) } });
    await page.goto(`/index.html#/challenges/${id}`);
    return id;
}

test.describe("Challenges", () => {
    test("New challenge picks a book or series, and Edit details creates the challenge", async ({ page, api }) => {
        await api.createBook({ title: "Alpha", author: "Ann", series: "Saga", seriesNumber: 1, seriesTotal: 3 });
        await api.createBook({ title: "Beta", author: "Ben", series: "Saga", seriesNumber: 2 });
        const gamma = await api.createBook({ title: "Gamma", author: "Gus" });

        await page.goto("/index.html#/challenges");
        await expect(page.getByRole("heading", { name: "No challenges yet" })).toBeVisible();
        await expect(page.getByRole("button", { name: /A to Z|scratch/i })).toHaveCount(0);
        await page.locator(".page-head").getByRole("button", { name: "New challenge" }).click();

        const picker = dialog(page, "New challenge");
        const list = picker.locator(".picker-list");
        // Regression: rows used to render as "[object HTMLButtonElement]" text.
        await expect(list).not.toContainText("[object");
        await expect(list).not.toContainText("null");
        // Challenges are only started from a book now, not from a blank form.
        await expect(picker.getByRole("button", { name: /scratch/i })).toHaveCount(0);
        await expect(list.locator(".picker-head")).toHaveText(["Series", "Books"]);
        await expect(list.locator(".picker-row strong")).toHaveText(["Saga", "Alpha", "Beta", "Gamma"]);
        const sagaRow = list.locator(".picker-row").filter({ has: page.locator("strong", { hasText: /^Saga$/ }) });
        await expect(sagaRow).toContainText("2 books not in a challenge · opens Alpha");

        await picker.getByRole("searchbox").fill("gus");
        await expect(list.locator(".picker-row strong")).toHaveText(["Gamma"]);
        await picker.getByRole("searchbox").fill("zzz");
        await expect(list).toContainText("Nothing matches that search.");
        await picker.getByRole("searchbox").fill("");

        // Pick a single book: it opens that book's Edit details, ready to create a challenge.
        await list.getByRole("button", { name: /Gamma/ }).click();
        await expect(page).toHaveURL(new RegExp(`#/book/${gamma.id}$`));
        const edit = dialog(page, "Edit details");
        const name = edit.getByLabel("New challenge name");
        await expect(name).toBeFocused();
        await name.fill("Rainbow Reading Challenge");
        await edit.getByLabel("What kind of challenge").fill("Read a book with a cover of every colour");
        await edit.getByLabel("Prompt for this book").fill("Red");
        await edit.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(page.locator(".detail-list").getByRole("link", { name: "Rainbow Reading Challenge · Red" })).toBeVisible();

        // Gamma is taken now, so the picker offers only the series and its books.
        await page.goto("/index.html#/challenges");
        await expect(page.locator(".challenge-card", { hasText: "Rainbow" })).toContainText("0/1 · 0%");
        await page.locator(".page-head").getByRole("button", { name: "New challenge" }).click();
        await expect(dialog(page, "New challenge").locator(".picker-row strong")).toHaveText(["Saga", "Alpha", "Beta"]);

        // Pick the series: it opens its first free book, where we add a new prompt to the existing challenge.
        await dialog(page, "New challenge").locator(".picker-row").filter({ has: page.locator("strong", { hasText: /^Saga$/ }) }).click();
        await expect(page.getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible();
        const editAlpha = dialog(page, "Edit details");
        const promptSelect = editAlpha.getByLabel("Prompt in Rainbow Reading Challenge", { exact: true });
        await expect(promptSelect).toBeFocused();
        await promptSelect.selectOption({ label: "+ New prompt…" });
        await editAlpha.getByRole("button", { name: "Save changes" }).click();
        await expect(editAlpha.locator(".form-error")).toHaveText("Type the new prompt for “Rainbow Reading Challenge”.");
        await editAlpha.getByLabel("New prompt in Rainbow Reading Challenge").fill("Orange");
        await editAlpha.getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");

        // The board shows the title, the kind of challenge, and a slot per prompt holding each book.
        await page.goto("/index.html#/challenges");
        await page.locator(".challenge-card", { hasText: "Rainbow" }).click();
        await expect(page.locator(".board-title")).toHaveText("Rainbow Reading Challenge");
        await expect(page.locator(".board-kind")).toHaveText("Read a book with a cover of every colour");
        await expect(slots(page).locator(".slot-label")).toHaveText(["Red", "Orange"]);
        await expect(slotButton(page, "Red")).toHaveAccessibleName("Red, Gamma");
        await expect(slotButton(page, "Orange")).toHaveAccessibleName("Orange, Alpha");
        await expect(page.locator(".board-count")).toHaveText("0/2 · 0%");

        // Tick one off from its slot.
        await slotButton(page, "Red").click();
        const slotDlg = dialog(page, "Red");
        await expect(slotDlg.locator(".slot-preview")).toContainText("Gamma");
        await slotDlg.getByLabel("Mark as done").check();
        await slotDlg.getByRole("button", { name: "Save" }).click();
        await expectToast(page, "Prompt saved");
        await expect(slotButton(page, "Red")).toHaveAccessibleName("Red, Gamma, done");
        await expect(page.locator(".board-count")).toHaveText("1/2 · 50%");

        // Taking Alpha out of the challenge from its Edit details empties its slot.
        await slotButton(page, "Orange").click();
        await dialog(page, "Orange").locator(".slot-preview").click();
        await expect(page.getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible();
        await page.getByRole("button", { name: "Edit details" }).click();
        await dialog(page, "Edit details").getByLabel("Prompt in Rainbow Reading Challenge", { exact: true }).selectOption({ label: "Not in this challenge" });
        await dialog(page, "Edit details").getByRole("button", { name: "Save changes" }).click();
        await expectToast(page, "Details saved");
        await expect(page.locator(".detail-list")).not.toContainText("Rainbow");
        await page.goBack();
        await expect(slotButton(page, "Orange")).toHaveAccessibleName("Orange, no book yet");
    });

    test("the board looks like a challenge sheet: colour prompts get their colour", async ({ page, api }) => {
        await openBoard(page, api, "Rainbow Reading Challenge", RAINBOW, "Read a book of every colour");

        await expect(page.locator(".board-title")).toHaveText("Rainbow Reading Challenge");
        await expect(page.locator(".board-title")).toHaveCSS("font-family", /Dancing Script/);
        await expect(page.locator(".board-kind")).toHaveText("Read a book of every colour");
        await expect(slots(page).locator(".slot-label")).toHaveText(RAINBOW);

        const bg = (label: string) => slotButton(page, label).locator(".slot-box");
        await expect(bg("Red")).toHaveCSS("background-color", "rgb(245, 155, 155)");
        await expect(bg("Dark Blue")).toHaveCSS("background-color", "rgb(163, 177, 238)");
        await expect(bg("Light Blue")).toHaveCSS("background-color", "rgb(191, 230, 230)");
        await expect(bg("Black")).toHaveCSS("background-color", "rgb(20, 20, 20)");
        await expect(bg("Grey")).toHaveCSS("background-color", "rgb(214, 214, 216)");

        // Four across on desktop, like the sheet.
        const tops = await slots(page).evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        expect(tops.slice(0, 4).every((t) => t === tops[0])).toBeTruthy();
        expect(tops[4]).toBeGreaterThan(tops[0]);
    });

    test("slots: link a book by letter, finishing it completes the prompt, add and remove prompts", async ({ page, api }) => {
        const alchemist = await api.createBook({ title: "The Alchemist", author: "Paulo" });
        await api.createBook({ title: "Zebra Tales", author: "Zed" });
        await openBoard(page, api, "A to Z", ["A", "B", "Z"]);
        await expect(page.locator(".board-count")).toHaveText("0/3 · 0%");

        // "The Alchemist" is suggested for A (a leading "The" is ignored).
        await slotButton(page, "A").click();
        const a = dialog(page, "A");
        const select = a.getByLabel("Book for this prompt");
        await expect(select.locator("optgroup[label='Starts with A'] option")).toHaveText(["The Alchemist — Paulo"]);
        await select.selectOption({ label: "The Alchemist — Paulo" });
        await a.getByRole("button", { name: "Save" }).click();
        await expectToast(page, "Book linked");
        await expect(slotButton(page, "A")).toHaveAccessibleName("A, The Alchemist");
        await expect(slotButton(page, "A").locator(".slot-status")).toHaveText("To Be Read");

        // Finish the book: the prompt completes by itself.
        await page.goto(`/index.html#/book/${alchemist.id}`);
        await page.getByLabel("Book status").selectOption("Read");
        await expectToast(page, "Moved to Read");
        await page.goBack();
        await expect(slotButton(page, "A")).toHaveAccessibleName("A, The Alchemist, done");
        await expect(slotButton(page, "A").locator(".slot-check")).toBeVisible();
        await expect(page.locator(".board-count")).toHaveText("1/3 · 33%");

        // Add a prompt, then remove one from its slot.
        await page.getByLabel("New prompt").fill("Bonus: a reread");
        await page.getByRole("button", { name: "Add prompt" }).click();
        await expectToast(page, "Prompt added");
        await expect(slots(page)).toHaveCount(4);
        await slotButton(page, "B").click();
        await dialog(page, "B").getByRole("button", { name: "Remove prompt" }).click();
        await dialog(page, "Remove this prompt?").getByRole("button", { name: "Remove" }).click();
        await expectToast(page, "Prompt removed");
        await expect(slots(page).locator(".slot-label")).toHaveText(["A", "Z", "Bonus: a reread"]);

        // Rename and describe it, then delete it.
        await page.locator(".board-tools").getByRole("button", { name: "Edit" }).click();
        const editDlg = dialog(page, "Edit challenge");
        await editDlg.getByLabel("Challenge title").fill("Alphabet Soup");
        await editDlg.getByLabel("What kind of challenge is it?").fill("One book per letter");
        await editDlg.getByRole("button", { name: "Save" }).click();
        await expect(page.locator(".board-title")).toHaveText("Alphabet Soup");
        await expect(page.locator(".board-kind")).toHaveText("One book per letter");

        await page.getByRole("button", { name: "Delete challenge" }).click();
        await dialog(page, "Delete this challenge?").getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Challenge deleted");
        await expect(page).toHaveURL(/#\/challenges$/);
        await expect(page.getByRole("heading", { name: "No challenges yet" })).toBeVisible();
    });

    test("challenges belong to their owner only", async ({ page, api, browser }) => {
        const mine = await api.createChallenge("Private", [{ label: "A" }]);

        // A second, separate user can't read, edit or delete it.
        const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
        const email = `e2e-other${Date.now()}@example.test`;
        const password = "E2e-test-pass-123";
        await other.request.post("/api/auth/register", { data: { username: `Other ${Date.now()}`, email, password } });
        await other.request.post("/api/auth/login", { data: { email, password } });

        expect((await (await other.request.get("/api/challenges")).json()).data).toEqual([]);
        expect((await other.request.put(`/api/challenges/${mine.id}`, { data: { name: "Hacked", items: [{ label: "x" }] } })).status()).toBe(404);
        expect((await other.request.delete(`/api/challenges/${mine.id}`)).status()).toBe(404);

        await other.request.delete("/api/auth/account", { data: { password } });
        await other.close();

        await page.goto(`/index.html#/challenges/${mine.id}`);
        await expect(page.locator(".board-title")).toHaveText("Private");
    });
});
