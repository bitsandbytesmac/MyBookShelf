import { test, expect, expectToast, dialog, today } from "./fixtures";
import type { Page } from "@playwright/test";

function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const card = (page: Page, title: string) => page.locator("section.dash-card", { has: page.getByRole("heading", { name: title, exact: true }) });

// A journal entry saved straight through the API (the PUT is a full replacement, so send the whole book).
async function logViaApi(page: Page, book: { id: string; title: string }, currentPage: number, sessionDate: string, sessionNote = "") {
    const response = await page.request.put(`/api/books/${book.id}`, {
        data: { title: book.title, author: "Test Author", status: "Reading", totalPages: 300, currentPage, genres: [], subgenres: [], quotes: [], sessionDate, sessionNote }
    });
    expect(response.ok(), await response.text()).toBeTruthy();
}

test.describe("Dashboard", () => {
    test("top cards: currently reading with progress, TBR and completed counts link into the library", async ({ page, api }) => {
        await api.createBook({ title: "On The Go", author: "Ava Writer", status: "Reading", totalPages: 200, currentPage: 50 });
        await api.createBook({ title: "Pile One" });
        await api.createBook({ title: "Pile Two" });
        await api.createBook({ title: "Done One", status: "Read", dateFinished: today() });

        await page.goto("/index.html#/dashboard");
        const reading = card(page, "Currently Reading");
        await expect(reading.locator(".cr-title")).toHaveText("On The Go");
        await expect(reading.locator(".cr-author")).toHaveText("Ava Writer");
        await expect(reading.locator(".cr-progress")).toContainText("25%");
        await expect(reading.locator(".cr-pages")).toHaveText("Page 50 of 200");

        await expect(page.locator(".dash-tbr .dash-stat-value")).toHaveText("2");
        await expect(page.locator(".dash-done .dash-stat-value")).toHaveText("1");
        // The shelf moved to the Library and the charts to Statistics.
        await expect(page.locator(".bookcase")).toHaveCount(0);
        await expect(page.getByRole("heading", { name: "Genres you've read" })).toHaveCount(0);

        await page.locator(".dash-tbr").click();
        await expect(page).toHaveURL(/#\/library\?status=To%20Be%20Read/);
        await expect(page.locator(".bookcase .shelf-book")).toHaveCount(2);
    });

    test("Log your reading: pick a book, write a note, step the page, save to journal; everything updates", async ({ page, api }) => {
        const book = await api.createBook({ title: "Journal Book", author: "Jo", status: "Reading", totalPages: 300, currentPage: 100 });
        await api.createBook({ title: "Not Started" }); // TBR books aren't offered while something is on the go

        await page.goto("/index.html#/dashboard");
        await expect(card(page, "Reading Streak").locator(".streak-pill strong")).toHaveText("0");
        await expect(card(page, "Most Recent Entries")).toContainText("Your journal entries will show up here.");

        // The top bar button replaces "Add book" ("+" still adds a book).
        await expect(page.getByRole("button", { name: "Add a book", exact: true })).toBeVisible();
        await page.locator("[data-action='log-reading']").click();
        const picker = dialog(page, "Log your reading");
        await expect(picker.getByRole("button", { name: /Not Started/ })).toHaveCount(0);
        await picker.getByRole("button", { name: /Journal Book/ }).click();

        const log = dialog(page, "Log your reading");
        await expect(log.getByLabel("Notes")).toBeFocused();
        await expect(log.getByLabel("Date")).toHaveValue(today());
        const pageBox = log.getByLabel("Page I'm on");
        await expect(pageBox).toHaveValue("100");

        // Nothing changed yet: saving is refused.
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expect(log.locator(".form-error")).toHaveText("Move your page on or write a note to save an entry.");

        await log.getByRole("button", { name: "One page forward" }).click();
        await log.getByRole("button", { name: "One page forward" }).click();
        await log.getByRole("button", { name: "One page back" }).click();
        await expect(pageBox).toHaveValue("101");
        await pageBox.fill("150");
        await expect(log.locator(".log-preview")).toContainText("50%");
        await expect(log.locator(".log-preview")).toContainText("+50 pages today");
        await log.getByLabel("Notes").fill("The twist in chapter 9!");
        await log.getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Saved to your journal");
        await expect(log).toBeHidden();

        // Currently Reading, streak, calendar and entries all update straight away.
        await expect(card(page, "Currently Reading").locator(".cr-pages")).toHaveText("Page 150 of 300");
        await expect(card(page, "Reading Streak").locator(".streak-pill strong")).toHaveText("1");
        await expect(card(page, "Reading Streak").locator(".streak-pill span")).toHaveText("day of streak");
        await expect(card(page, "Reading Streak").locator(".cal-day.is-today")).toHaveClass(/is-read/);
        const entry = card(page, "Most Recent Entries").locator(".entry").first();
        await expect(entry.locator(".entry-pages")).toHaveText("+50 pages read");
        await expect(entry.locator(".entry-note")).toHaveText("The twist in chapter 9!");

        // The book page shows the same entry and opens the same window.
        await entry.click();
        await expect(page).toHaveURL(new RegExp(`#/book/${book.id}$`));
        await expect(page.locator(".sessions")).toContainText("The twist in chapter 9!");
        await expect(page.locator(".sessions")).toContainText("p. 100 → 150");
        await page.getByRole("button", { name: "Log your reading" }).last().click();
        const again = dialog(page, "Log your reading");
        await expect(again.locator(".log-book")).toContainText("Journal Book");

        // A note on its own (no new pages) is still a journal entry.
        await again.getByLabel("Notes").fill("Thinking about the ending.");
        await again.getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Saved to your journal");
        await expect(page.locator(".sessions li").first()).toContainText("Note");
        await expect(page.locator(".sessions li").first()).toContainText("Thinking about the ending.");

        // Logging the last page finishes the book.
        await page.getByRole("button", { name: "Log your reading" }).last().click();
        await dialog(page, "Log your reading").getByLabel("Page I'm on").fill("300");
        await dialog(page, "Log your reading").getByRole("button", { name: "Save to journal" }).click();
        await expectToast(page, "Finished! Time to write your review 🎉");
        await expect(page.locator(".book-hero .badge").first()).toHaveText("Read");
    });

    test("the streak counts back-to-back days and the calendar marks them", async ({ page, api }) => {
        const book = await api.createBook({ title: "Streaky", status: "Reading", totalPages: 300, currentPage: 10 });
        await logViaApi(page, book, 20, daysAgo(4));
        await logViaApi(page, book, 30, daysAgo(2));
        await logViaApi(page, book, 40, daysAgo(1));

        await page.goto("/index.html#/dashboard");
        const streak = card(page, "Reading Streak");
        // Yesterday and the day before count; the gap 3 days ago ends the run. Today isn't logged yet.
        await expect(streak.locator(".streak-pill strong")).toHaveText("2");
        await expect(streak.locator(".dash-foot")).toHaveText("Read today to keep your streak alive.");
        const inThisMonth = [1, 2, 4].filter((n) => daysAgo(n).slice(0, 7) === today().slice(0, 7)).length;
        await expect(streak.locator(".cal-day.is-read")).toHaveCount(inThisMonth);
    });

    test("reading goals: books this year with covers, plus custom goals added, edited and deleted", async ({ page, api }) => {
        await api.createBook({ title: "Classic One", genres: ["Classics"], status: "Read", dateFinished: today(), totalPages: 250 });
        await api.createBook({ title: "Not Classic", genres: ["Thriller"], status: "Read", dateFinished: today(), totalPages: 300 });

        await page.goto("/index.html#/dashboard");
        const goals = card(page, "Your Reading Goals");
        await expect(goals.locator(".year-goal .goal-number")).toHaveText("2 books finished");
        await expect(goals.locator(".year-goal .goal-foot")).toHaveText("10 books more to go · goal 12");
        await expect(goals.locator(".goal-covers a")).toHaveCount(2);

        await goals.getByRole("button", { name: "Add another goal" }).click();
        const add = dialog(page, "Add a reading goal");
        await add.getByLabel("Target").fill("3");
        await add.getByLabel("Count", { exact: true }).selectOption("books");
        await add.getByLabel("When").selectOption("year");
        await expect(add.getByLabel("Which one")).toBeHidden();
        await add.getByLabel("Only count").selectOption("genre");
        await add.getByLabel("Which one").selectOption("Classics");
        await add.getByRole("button", { name: "Add goal" }).click();
        await expectToast(page, "Goal added");

        const goal = goals.locator(".custom-goal");
        await expect(goal.locator("h3")).toHaveText("3 Classics books this year");
        await expect(goal.locator(".goal-number-sm")).toHaveText("1 / 3 books");

        await goal.getByRole("button", { name: /^Edit goal/ }).click();
        const edit = dialog(page, "Edit goal");
        await edit.getByLabel("Name").fill("Page sprint");
        await edit.getByLabel("Count", { exact: true }).selectOption("pages");
        await edit.getByLabel("Target").fill("500");
        await edit.getByLabel("When").selectOption("month");
        await edit.getByLabel("Only count").selectOption("");
        await edit.getByRole("button", { name: "Save goal" }).click();
        await expectToast(page, "Goal saved");
        await expect(goal.locator("h3")).toHaveText("Page sprint");
        await expect(goal.locator(".goal-number-sm")).toHaveText("550 / 500 pages");
        await expect(goal).toContainText("Goal reached!");

        // The yearly target itself can be changed.
        await goals.getByRole("button", { name: "Edit goals" }).click();
        await goals.getByLabel("Books this year").fill("4");
        await goals.getByRole("button", { name: "Save goals" }).click();
        await expectToast(page, "Reading goals saved");
        await expect(goals.locator(".year-goal .goal-foot")).toHaveText("2 books more to go · goal 4");

        await goal.getByRole("button", { name: /^Delete goal/ }).click();
        await dialog(page, "Delete this goal?").getByRole("button", { name: "Delete" }).click();
        await expectToast(page, "Goal deleted");
        await expect(goal).toHaveCount(0);
    });

    test("Next Up: add TBR books to the empty slots, remove one, and starting a book frees its slot", async ({ page, api }) => {
        await api.createBook({ title: "Fourth Wing" });
        await api.createBook({ title: "The Hobbit" });
        await api.createBook({ title: "Already Reading", status: "Reading", totalPages: 100, currentPage: 5 });

        await page.goto("/index.html#/dashboard");
        const next = card(page, "Next Up");
        await expect(next.getByRole("button", { name: "Add a book to Next Up" })).toHaveCount(3);

        await next.getByRole("button", { name: "Add a book to Next Up" }).first().click();
        const picker = dialog(page, "Add to Next Up");
        await expect(picker.locator(".picker-row strong")).toHaveText(["Fourth Wing", "The Hobbit"]); // TBR only
        await picker.getByRole("button", { name: /The Hobbit/ }).click();
        await expectToast(page, `"The Hobbit" is up next`);
        await next.getByRole("button", { name: "Add a book to Next Up" }).first().click();
        await dialog(page, "Add to Next Up").getByRole("button", { name: /Fourth Wing/ }).click();
        await expect(next.locator(".next-title")).toHaveText(["The Hobbit", "Fourth Wing"]);
        await expect(next.getByRole("button", { name: "Add a book to Next Up" })).toHaveCount(1);

        // It's saved on the account.
        await page.reload();
        await expect(next.locator(".next-title")).toHaveText(["The Hobbit", "Fourth Wing"]);

        await next.getByRole("button", { name: "Remove The Hobbit from Next Up" }).click();
        await expect(next.locator(".next-title")).toHaveText(["Fourth Wing"]);

        // Start Fourth Wing by logging it: it leaves Next Up because it's no longer To Be Read.
        await page.locator("[data-action='log-reading']").click();
        await expect(dialog(page, "Log your reading").getByRole("button", { name: /Already Reading/ })).toBeVisible();
        await dialog(page, "Log your reading").getByRole("button", { name: "Close" }).click();
        await page.goto("/index.html#/library");
        await page.locator(".bookcase").getByRole("link", { name: /^Fourth Wing/ }).click();
        await page.getByLabel("Book status").selectOption("Reading");
        await expectToast(page, "Moved to Reading");
        await page.goto("/index.html#/dashboard");
        await expect(next.locator(".next-title")).toHaveCount(0);
        await expect(next.getByRole("button", { name: "Add a book to Next Up" })).toHaveCount(3);
    });

    test("quote of the day shows a saved quote and stays the same all day", async ({ page, api }) => {
        await page.goto("/index.html#/dashboard");
        await api.createBook({ title: "Quiet" });
        await page.reload();
        await expect(card(page, "Quote of the Day")).toContainText("Save favourite lines in a book's Review");

        for (const [title, quote] of [["Q1", "First lovely line."], ["Q2", "Second lovely line."], ["Q3", "Third lovely line."]]) {
            await page.request.post("/api/books", { data: { title, author: "Poet", status: "Read", genres: [], subgenres: [], quotes: [quote] } });
        }
        await page.reload();
        const quote = card(page, "Quote of the Day").locator("blockquote");
        const first = await quote.textContent();
        expect(["First lovely line.", "Second lovely line.", "Third lovely line."]).toContain(first);
        for (let i = 0; i < 3; i++) {
            await page.reload();
            await expect(quote).toHaveText(first!);
        }
        await expect(card(page, "Quote of the Day").locator(".dash-foot")).toHaveText("A new quote every day · 3 quotes saved");
    });
});
