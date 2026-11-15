import { test, expect, expectToast, dialog, today, blockExternal } from "./fixtures";
import type { Page } from "@playwright/test";

const YEAR = new Date().getFullYear();

type Tags = { genres?: string[]; subgenres?: string[]; tropes?: string[]; themes?: string[]; settings?: string[]; characters?: string[] };

// Books with tags, straight through the API.
async function addBook(page: Page, title: string, extra: Record<string, unknown> & Tags = {}) {
    const response = await page.request.post("/api/books", {
        data: { title, author: "Test Author", status: "To Be Read", genres: [], subgenres: [], quotes: [], ...extra }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    const row = (await response.json()).data;
    return { id: String(row.id), title };
}

async function addChallenge(page: Page, body: Record<string, unknown>) {
    const response = await page.request.post("/api/challenges", { data: { description: "", ...body } });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json()).data as { id: string };
}

const finished = { status: "Read", dateFinished: today() };
const slots = (page: Page) => page.locator(".board-slots > li");
const slotButton = (page: Page, label: string) => slots(page).filter({ has: page.locator(".slot-label", { hasText: new RegExp(`^${label}$`) }) }).locator(".slot-btn");

test.describe("Smart challenges", () => {
    test("create from a template: books already read are matched and counted after confirmation", async ({ page, account }) => {
        void account; // signs in
        await addBook(page, "Read Fantasy", { genres: ["Fantasy"], ...finished });
        await addBook(page, "Read Mystery", { genres: ["Mystery"], ...finished });
        await addBook(page, "Unread Romance", { genres: ["Romance"] });

        await page.goto("/index.html#/challenges");
        await expect(page.getByRole("heading", { name: "No challenges yet" })).toBeVisible();
        await page.locator(".page-head").getByRole("button", { name: "New challenge" }).click();

        const create = dialog(page, "New challenge");
        await expect(create.getByLabel("Start from")).toHaveValue("genres");
        await expect(create.locator(".template-preview")).toContainText("12 spots: Fantasy, Romance, Mystery");
        await expect(create.getByLabel("Challenge title")).toHaveValue("Genre Explorer");
        await expect(create.getByLabel("What kind of challenge is it?")).toHaveValue("Read one book from each genre.");
        await expect(create.getByLabel("Starts")).toHaveValue(`${YEAR}-01-01`);
        await create.getByRole("button", { name: "Create challenge" }).click();
        await expectToast(page, "Challenge created");

        // The two finished books fit open spots: nothing is counted until confirmed.
        const review = dialog(page, "Books you've already read fit!");
        await expect(review.locator(".match-row")).toHaveCount(2);
        await expect(review.locator(".match-row").first()).toContainText("Fantasy");
        await expect(review.locator(".match-row").first().locator(".reason-chip")).toHaveText("Genre: Fantasy");
        await review.getByRole("checkbox", { name: "Mystery: Read Mystery" }).uncheck(); // choose which books count
        await review.getByRole("button", { name: "Count them" }).click();
        await expectToast(page, "1 spot unlocked 🎉");

        await expect(page.locator(".board-title")).toHaveText("Genre Explorer");
        await expect(page.locator(".board-count")).toHaveText("1/12 · 8%");
        await expect(slotButton(page, "Fantasy")).toHaveAccessibleName("Fantasy, Read Fantasy, done");
        await expect(slotButton(page, "Mystery")).toHaveAccessibleName(/Mystery, no book yet, 1 ready/);
        await expect(slotButton(page, "Romance")).toHaveAccessibleName(/Romance, no book yet, 1 on TBR/);
        // The skipped book can still be counted later from the board.
        await page.getByRole("button", { name: "1 spot can be filled from books you've read" }).click();
        await dialog(page, "Books you've already read fit!").getByRole("button", { name: "Count them" }).click();
        await expect(page.locator(".board-count")).toHaveText("2/12 · 17%");
    });

    test("finishing a book shows every spot it unlocks across challenges, confirmed vs possible, before counting", async ({ page, account }) => {
        void account; // signs in
        const book = await addBook(page, "The Dragon Queen", {
            genres: ["Fantasy"], tropes: ["Enemies to Lovers"], totalPages: 400, status: "Reading", currentPage: 50,
            summary: "A story of grief and courage on a windswept island."
        });
        await addChallenge(page, {
            name: "Fantasy Year", startsOn: `${YEAR}-01-01`, endsOn: `${YEAR}-12-31`,
            items: [
                { label: "A fantasy", criteria: { genres: ["Fantasy"] } },
                { label: "Big book", criteria: { minPages: 350 } },
                { label: "A sci-fi", criteria: { genres: ["Science Fiction"] } }
            ]
        });
        await addChallenge(page, { name: "Trope Bingo", items: [{ label: "Enemies", criteria: { tropes: ["Enemies to Lovers"] } }, { label: "Island", criteria: { settings: ["Island"] } }] });
        await addChallenge(page, { name: "Quiet One", autoMatch: false, items: [{ label: "Any fantasy", criteria: { genres: ["Fantasy"] } }] });

        await page.goto(`/index.html#/book/${book.id}`);
        // Before finishing, the book page already shows where it fits.
        const spotsCard = page.locator(".challenge-spots");
        await expect(spotsCard.getByText("Can fill once finished")).toBeVisible();
        await expect(spotsCard.locator(".spot-row")).toHaveCount(5); // 4 confirmed (incl. auto-match off) + 1 possible
        await expect(spotsCard.getByText("Possible matches")).toBeVisible();

        await page.getByLabel("Book status").selectOption("Read");
        const unlock = dialog(page, "You unlocked challenge spots!");
        await expect(unlock).toBeVisible();
        const groups = unlock.locator(".unlock-group");
        // Newest challenge first (same order as the Challenges page); the "auto-match off" one isn't offered.
        await expect(groups.locator("h3")).toHaveText([/^Trope Bingo/, /^Fantasy Year/]);

        // One confirmed spot per challenge is pre-ticked; a second confirmed spot and the possible one aren't.
        await expect(unlock.getByRole("checkbox", { name: "Fantasy Year: A fantasy" })).toBeChecked();
        await expect(unlock.getByRole("checkbox", { name: "Fantasy Year: Big book" })).not.toBeChecked();
        await expect(unlock.getByRole("checkbox", { name: "Trope Bingo: Enemies" })).toBeChecked();
        const island = unlock.locator(".match-row", { hasText: "Island" });
        await expect(island.locator(".match-badge")).toHaveText("Possible match");
        await expect(island.locator(".reason-chip.is-possible")).toHaveText("Setting “Island” is mentioned in the summary");
        await expect(unlock.getByRole("checkbox", { name: "Trope Bingo: Island" })).not.toBeChecked();

        await unlock.getByRole("checkbox", { name: "Fantasy Year: Big book" }).check(); // a book may fill several prompts
        await unlock.getByRole("button", { name: "Count it" }).click();
        await expectToast(page, "3 spots unlocked 🎉");

        await expect(spotsCard.locator(".spot-row .match-badge", { hasText: "Counts" })).toHaveCount(3);

        // The challenge dashboard reflects it.
        await page.goto("/index.html#/challenges");
        const cards = page.locator(".challenge-card");
        await expect(cards.filter({ hasText: "Fantasy Year" })).toContainText("2/3 spots · 67%");
        await expect(cards.filter({ hasText: "Trope Bingo" })).toContainText("1/2 spots · 50%");
        await expect(page.locator(".unlocked-list .unlocked")).toHaveCount(3);
        await expect(page.locator(".stat-tile").filter({ hasText: "Spots filled" }).locator(".dash-stat-value")).toHaveText("3/6");
    });

    test("spot panel: ready, TBR and possible matches with reasons; a planned book completes when finished", async ({ page, account }) => {
        void account; // signs in
        await addBook(page, "Finished Witch", { characters: ["Witch"], ...finished });
        const tbr = await addBook(page, "Witch Next", { characters: ["Witch"], totalPages: 100 });
        await addBook(page, "Hinted", { summary: "Every witch in town is hiding something." });
        const c = await addChallenge(page, { name: "Spooky", items: [{ label: "A witch", criteria: { characters: ["Witch"] } }, { label: "Red cover" }] });

        await page.goto(`/index.html#/challenges/${c.id}`);
        await slotButton(page, "A witch").click();
        const panel = dialog(page, "A witch");
        await expect(panel.locator(".rule-chip")).toHaveText(["Character: Witch"]);
        const sections = panel.locator(".match-section");
        await expect(sections.locator("h3")).toHaveText([/^Ready to count/, /^On your TBR or reading now/, /^Possible matches/]);
        await expect(sections.nth(0)).toContainText("Finished Witch");
        await expect(sections.nth(1)).toContainText("Witch Next");
        await expect(sections.nth(2).locator(".reason-chip.is-possible")).toHaveText("Character “Witch” is mentioned in the summary");

        // Plan the TBR book instead of counting the finished one.
        await sections.nth(1).getByRole("button", { name: "Plan this" }).click();
        await expectToast(page, `"Witch Next" planned for A witch`);
        await expect(slotButton(page, "A witch")).toHaveAccessibleName("A witch, Witch Next, planned");
        await expect(page.locator(".board-count")).toHaveText("0/2 · 0%"); // only finished books count

        // A spot without rules is picked by hand.
        await slotButton(page, "Red cover").click();
        const red = dialog(page, "Red cover");
        await expect(red.locator(".rule-chip")).toHaveText(["Chosen by hand"]);
        await red.getByLabel("Choose the book for this spot").selectOption({ label: "Finished Witch — Test Author" });
        await red.getByRole("button", { name: "Use", exact: true }).click();
        await expect(page.locator(".board-count")).toHaveText("1/2 · 50%");

        // Finishing the planned book completes its spot with no extra step.
        await page.goto(`/index.html#/book/${tbr.id}`);
        await page.getByLabel("Book status").selectOption("Read");
        await expectToast(page, `"Witch Next" completed 1 challenge spot 🎉`);
        await page.goto(`/index.html#/challenges/${c.id}`);
        await expect(page.locator(".board-count")).toHaveText("2/2 · 100%");
        await expect(page.locator(".board-done")).toHaveText("Challenge complete! 🎉");

        // Completed challenges move to their own tab.
        await page.goto("/index.html#/challenges");
        await page.getByRole("tab", { name: /^Completed/ }).click();
        await expect(page.locator(".challenge-card")).toContainText("Completed");
    });

    test("spot rules editor: add a spot with rules; matches update; deleting a book frees its spot", async ({ page, account }) => {
        void account; // signs in
        await addBook(page, "Long Classic", { genres: ["Classics"], totalPages: 650, ...finished, publishedYear: 1866 });
        await addBook(page, "Short Classic", { genres: ["Classics"], totalPages: 120, ...finished });
        const c = await addChallenge(page, { name: "Chunky", items: [{ label: "Anything" }] });

        await page.goto(`/index.html#/challenges/${c.id}`);
        await page.getByRole("button", { name: "Add a spot" }).click();
        const editor = dialog(page, "Add a spot");
        await editor.getByLabel("Prompt").fill("A classic over 500 pages");
        await editor.locator("summary", { hasText: "Genres" }).click();
        await editor.getByRole("group", { name: "Genres" }).getByRole("button", { name: "Classics" }).click();
        await editor.locator("#spMinPages").fill("500");
        await editor.getByRole("button", { name: "Add spot" }).click();
        await expectToast(page, "Spot added");

        await expect(slotButton(page, "A classic over 500 pages")).toHaveAccessibleName(/1 ready/);
        await slotButton(page, "A classic over 500 pages").click();
        const panel = dialog(page, "A classic over 500 pages");
        await expect(panel.locator(".rule-chip")).toHaveText(["Genre: Classics", "500+ pages"]);
        const ready = panel.locator(".match-section").first();
        await expect(ready.locator(".match-row")).toHaveCount(1);
        await expect(ready.locator(".reason-chip")).toHaveText(["Genre: Classics", "650 pages"]);
        await ready.getByRole("button", { name: "Count this" }).click();
        await expect(slotButton(page, "A classic over 500 pages")).toHaveAccessibleName("A classic over 500 pages, Long Classic, done");

        // Tighten the rules from the panel: published before 1900 still fits.
        await slotButton(page, "A classic over 500 pages").click();
        await dialog(page, "A classic over 500 pages").getByRole("button", { name: "Edit rules" }).click();
        const rules = dialog(page, "Spot rules");
        await rules.locator("#spYearTo").fill("1899");
        await rules.getByRole("button", { name: "Save rules" }).click();
        await expectToast(page, "Spot rules saved");

        // Deleting the book frees the spot (the spot itself stays).
        await page.getByRole("button", { name: /A classic over 500 pages, Long Classic/ }).click();
        await dialog(page, "A classic over 500 pages").locator(".spot-current a").click();
        await page.getByRole("button", { name: "Delete book" }).click();
        await dialog(page, "Delete this book?").getByRole("button", { name: "Delete" }).click();
        await expect(page).toHaveURL(/#\/library$/); // the app moves on by itself once the book is gone
        await page.goto(`/index.html#/challenges/${c.id}`);
        await expect(slotButton(page, "A classic over 500 pages")).toHaveAccessibleName("A classic over 500 pages, no book yet");
        const after = await (await page.request.get("/api/challenges")).json();
        expect(after.data[0].items[1].bookId).toBeNull();
    });

    test("dashboard: open spots with match counts, recommendations from the shelf, and upcoming challenges", async ({ page, account }) => {
        void account; // signs in
        await addBook(page, "Cozy Mystery TBR", { genres: ["Mystery"], subgenres: ["Cozy Mystery"] });
        await addChallenge(page, { name: "Whodunnit", items: [{ label: "A mystery", criteria: { genres: ["Mystery"] } }, { label: "A cozy one", criteria: { genres: ["Cozy Mystery"] } }] });
        await addChallenge(page, { name: "Next Year", startsOn: `${YEAR + 1}-01-01`, endsOn: `${YEAR + 1}-12-31`, items: [{ label: "Anything" }] });

        await page.goto("/index.html#/challenges");
        await expect(page.locator(".stat-tile").filter({ hasText: "Open spots" }).locator(".dash-stat-value")).toHaveText("2");
        const open = page.locator(".open-spot");
        await expect(open).toHaveCount(2);
        await expect(open.first()).toContainText("1 on TBR");
        const reco = page.locator(".reco");
        await expect(reco).toHaveCount(1);
        await expect(reco).toContainText("fits 2 spots");
        await expect(reco.locator(".reason-chip")).toHaveText(["Whodunnit: A mystery", "Whodunnit: A cozy one"]);

        await page.getByRole("tab", { name: /^Upcoming/ }).click();
        await expect(page.locator(".challenge-card")).toHaveCount(1);
        await expect(page.locator(".challenge-card")).toContainText("Upcoming");

        // Opening an open spot from the dashboard goes straight to its panel.
        await page.getByRole("tab", { name: /^Active/ }).click();
        await open.first().click();
        await expect(page.getByRole("dialog")).toContainText("On your TBR or reading now");
    });

    test("rainbow template: colour spots get their colour and are picked by hand", async ({ page, account }) => {
        void account; // signs in
        await page.goto("/index.html#/challenges");
        await page.locator(".page-head").getByRole("button", { name: "New challenge" }).click();
        const create = dialog(page, "New challenge");
        await create.getByLabel("Start from").selectOption("rainbow");
        await expect(create.getByLabel("Challenge title")).toHaveValue("Rainbow Reading Challenge");
        await expect(create.locator(".template-preview")).toContainText("You choose the book for each spot.");
        await create.getByRole("button", { name: "Create challenge" }).click();

        await expect(page.locator(".board-title")).toHaveCSS("font-family", /Dancing Script/);
        await expect(slots(page).locator(".slot-label")).toHaveText(["Red", "Orange", "Yellow", "Green", "Dark Blue", "Light Blue", "Purple", "Pink", "White", "Black", "Brown", "Grey", "New spot"]);
        await expect(slotButton(page, "Red").locator(".slot-box")).toHaveCSS("background-color", "rgb(245, 155, 155)");
        await expect(slotButton(page, "Black").locator(".slot-box")).toHaveCSS("background-color", "rgb(20, 20, 20)");
        await expect(slots(page).first().locator(".slot-rules")).toHaveText("You pick");
    });

    test("challenges belong to their owner only", async ({ page, browser, account }) => {
        void account; // signs in
        const mine = await addChallenge(page, { name: "Private", items: [{ label: "A", criteria: { genres: ["Fantasy"] } }] });

        const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
        await blockExternal(other);
        const email = `e2e-other${Date.now()}@example.test`;
        const password = "E2e-test-pass-123";
        const registered = await other.request.post("/api/auth/register", { data: { username: `Other ${Date.now()}`, email, password } });
        expect(registered.ok(), `register: ${registered.status()} ${await registered.text()}`).toBeTruthy();
        const loggedIn = await other.request.post("/api/auth/login", { data: { email, password } });
        expect(loggedIn.ok(), `login: ${loggedIn.status()} ${await loggedIn.text()}`).toBeTruthy();

        expect((await (await other.request.get("/api/challenges")).json()).data).toEqual([]);
        expect((await other.request.put(`/api/challenges/${mine.id}`, { data: { name: "Hacked", items: [{ label: "x" }] } })).status()).toBe(404);
        expect((await other.request.delete(`/api/challenges/${mine.id}`)).status()).toBe(404);

        await other.request.delete("/api/auth/account", { data: { password } });
        await other.close();
    });

    test("the server validates spot rules", async ({ page, account }) => {
        void account; // signs in
        const bad = async (criteria: Record<string, unknown>) =>
            (await page.request.post("/api/challenges", { data: { name: "X", items: [{ label: "S", criteria }] } })).json();
        await page.goto("/index.html#/challenges"); // signs in via the fixture
        expect((await bad({ format: ["Scroll"] })).message).toContain("Format must be one of");
        expect((await bad({ minPages: 500, maxPages: 100 })).message).toContain("Maximum pages can't be less than minimum pages");
        expect((await bad({ title: { mode: "endsWith", value: "x" } })).message).toContain("Title rule");
        const ok = await page.request.post("/api/challenges", { data: { name: "OK", items: [{ label: "S", criteria: { genres: ["Fantasy"], junk: 1 } }] } });
        expect((await ok.json()).data.items[0].criteria).toEqual({ genres: ["Fantasy"] }); // unknown keys dropped
    });
});
