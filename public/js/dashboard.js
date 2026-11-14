// Dashboard: Currently Reading / TBR / Completed, reading streak, reading goals, quote of the day,
// Next Up and the most recent journal entries. (The charts live on the Statistics page, the shelf in the Library.)
import {
    state, percent, booksFinished, saveGoals, saveCustomGoal, deleteCustomGoal, goalProgress, goalTitle,
    genreOptions, GOAL_FILTER_LABELS, FORMATS, AGE_CATEGORIES, getBook,
    nextUpBooks, saveNextUp, NEXT_UP_MAX, readingDays, readingStreak, today
} from "./store.js";
import { h, icon, cover, progressBar, fmt, toast, modal, confirmDialog } from "./ui.js";
import { openAddBook } from "./dialogs.js";
import { openCustomize } from "./theme.js";
import { openLogReading } from "./logReading.js";

export function currentUser() {
    try {
        return JSON.parse(localStorage.getItem("user")) || {};
    } catch {
        return {};
    }
}

export function loadingSkeleton() {
    return h("div", {},
        h("div", { class: "skeleton", style: { height: "40px", width: "280px", marginBottom: "28px" } }),
        h("div", { class: "skeleton", style: { height: "120px", marginBottom: "16px" } }),
        h("div", { class: "skeleton", style: { height: "240px" } })
    );
}

function greeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

const bookHref = (id) => `#/book/${id}`;

// "29 October" (adds the year when it isn't this year).
function dayLabel(value) {
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

export function renderDashboard() {
    if (!state.loaded) return loadingSkeleton();

    const user = currentUser();
    const books = state.books;

    const head = h("div", { class: "page-head" },
        h("div", {},
            h("h1", {}, `${greeting()}${user.username ? `, ${user.username}` : ""}`),
            h("p", {}, books.length ? "Here's your reading life at a glance." : "Your shelf is waiting for its first book.")
        ),
        h("div", { class: "head-actions" },
            h("button", { class: "btn btn-ghost customize-btn", type: "button", onclick: openCustomize, "aria-label": "Customize colours" },
                icon("palette"), h("span", { class: "label" }, "Customize")),
            books.length
                ? h("button", { class: "btn btn-primary mobile-only", type: "button", onclick: () => openLogReading() }, icon("pen"), "Log your reading")
                : null)
    );

    if (!books.length) {
        return h("div", {}, head,
            h("div", { class: "card empty" },
                h("h3", {}, "Start your shelf"),
                h("p", {}, "Search for a book and its cover, author and summary fill in automatically."),
                h("button", { class: "btn btn-primary", type: "button", onclick: openAddBook }, icon("plus"), "Add your first book")
            )
        );
    }

    const count = (status) => books.filter((b) => b.status === status).length;

    return h("div", {}, head,
        h("div", { class: "dash-board" },
            currentlyReadingCard(),
            statCard("dash-tbr", "TBR", count("To Be Read"), "books in your TBR", "#/library?status=To%20Be%20Read"),
            statCard("dash-done", "Completed", count("Read"), "books finished", "#/library?status=Read"),
            streakCard(),
            goalsCard(),
            quoteCard(),
            nextUpCard(),
            recentEntriesCard()
        )
    );
}

// ---------- Currently Reading ----------

function currentlyReadingCard() {
    // Most recently logged first, then most recently added.
    const lastLogged = (book) => state.activities.find((a) => String(a.book_id) === book.id)?.created_at || "";
    const reading = state.books.filter((b) => b.status === "Reading")
        .sort((a, b) => String(lastLogged(b)).localeCompare(String(lastLogged(a))) || Number(b.id) - Number(a.id));
    const book = reading[0];

    const card = h("section", { class: "card dash-card dash-reading", "aria-labelledby": "dashReadingTitle" },
        h("div", { class: "dash-card-head" },
            h("h2", { id: "dashReadingTitle" }, "Currently Reading"),
            reading.length > 1 ? h("a", { href: "#/library?status=Reading" }, `+${reading.length - 1} more`) : null));

    if (!book) {
        card.append(
            h("p", { class: "dash-empty" }, "Nothing on the go right now."),
            h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => openLogReading() }, "Start a book"));
        return card;
    }

    const pct = percent(book);
    card.append(h("div", { class: "cr-book" },
        h("a", { href: bookHref(book.id), class: "cr-cover", "aria-hidden": "true", tabindex: "-1" }, cover(book, "sm")),
        h("div", { class: "cr-info" },
            h("a", { href: bookHref(book.id), class: "cr-title" }, book.title),
            h("span", { class: "cr-author" }, book.author),
            book.totalPages
                ? h("div", { class: "cr-progress" }, progressBar(pct, { thin: true }), h("span", {}, `${pct}%`))
                : null,
            h("span", { class: "cr-pages" }, book.totalPages ? `Page ${fmt.num(book.currentPage)} of ${fmt.num(book.totalPages)}` : "Add page count to track progress"),
            h("button", { class: "btn btn-sm cr-log", type: "button", onclick: () => openLogReading(book.id) }, icon("pen"), "Log reading"))
    ));
    return card;
}

function statCard(cls, label, value, sub, href) {
    return h("a", { class: `card dash-card dash-stat ${cls}`, href },
        h("span", { class: "dash-stat-label" }, label),
        h("span", { class: "dash-stat-value" }, fmt.num(value)),
        h("span", { class: "dash-stat-sub" }, sub));
}

// ---------- Streak + this month's calendar ----------

function streakCard() {
    const days = readingDays();
    const streak = readingStreak(days);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // Monday first
    const key = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const readThisMonth = Array.from({ length: daysInMonth }, (_, i) => i + 1).filter((d) => days.has(key(d))).length;
    const loggedToday = days.has(today());
    const monthName = now.toLocaleDateString(undefined, { month: "long" });

    const cells = [
        ...Array.from({ length: offset }, () => h("span", { class: "cal-day is-blank" })),
        ...Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const read = days.has(key(d));
            return h("span", {
                class: `cal-day${read ? " is-read" : ""}${d === now.getDate() ? " is-today" : ""}`,
                title: `${monthName} ${d}${read ? ": read" : ""}`
            }, String(d));
        })
    ];

    return h("section", { class: "card dash-card dash-streak", "aria-labelledby": "dashStreakTitle" },
        h("div", { class: "dash-card-head" }, h("h2", { id: "dashStreakTitle" }, "Reading Streak")),
        h("div", { class: "streak-body" },
            h("div", { class: `streak-pill${streak ? " is-on" : ""}` },
                h("strong", {}, String(streak)),
                h("span", {}, streak === 1 ? "day of streak" : "days of streak")),
            h("div", { class: "streak-cal" },
                h("span", { class: "cal-month" }, monthName),
                h("div", { class: "cal-grid", role: "img", "aria-label": `Read on ${fmt.plural(readThisMonth, "day")} in ${monthName}` },
                    ["M", "T", "W", "T", "F", "S", "S"].map((w) => h("span", { class: "cal-head", "aria-hidden": "true" }, w)),
                    cells))),
        h("p", { class: "dash-foot" }, !streak
            ? "Log your reading to start a streak."
            : loggedToday ? "You've read today. Keep it going! 🔥" : "Read today to keep your streak alive.")
    );
}

// ---------- Reading goals ----------

function goalsCard() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { monthlyGoal, yearlyGoal } = state.goals;
    const finished = booksFinished({ year }).sort((a, b) => b.dateFinished.localeCompare(a.dateFinished));
    const done = finished.length;
    const left = Math.max(yearlyGoal - done, 0);
    const pct = Math.min(100, Math.round((done / yearlyGoal) * 100));

    const monthlyInput = h("input", { class: "input", type: "number", min: 1, max: 100, value: monthlyGoal, id: "gMonthly" });
    const yearlyInput = h("input", { class: "input", type: "number", min: 1, max: 1000, value: yearlyGoal, id: "gYearly" });
    const editForm = h("form", { class: "goal-edit hidden" },
        h("div", { class: "field" }, h("label", { for: "gYearly" }, "Books this year"), yearlyInput),
        h("div", { class: "field" }, h("label", { for: "gMonthly" }, "Books a month"), monthlyInput),
        h("button", { class: "btn btn-sm btn-primary", type: "submit" }, "Save goals"),
        h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => editForm.classList.add("hidden") }, "Cancel")
    );
    editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const m = Number(monthlyInput.value);
        const y = Number(yearlyInput.value);
        if (!Number.isInteger(m) || m < 1 || m > 100) return toast("Monthly goal must be 1–100 books.", { error: true });
        if (!Number.isInteger(y) || y < 1 || y > 1000) return toast("Yearly goal must be 1–1000 books.", { error: true });
        try {
            await saveGoals({ monthlyGoal: m, yearlyGoal: y });
            toast("Reading goals saved");
        } catch (error) {
            toast(error.message, { error: true });
        }
    });

    const shown = finished.slice(0, 6);
    return h("section", { class: "card dash-card dash-goals", "aria-labelledby": "dashGoalsTitle" },
        h("div", { class: "dash-card-head" },
            h("h2", { id: "dashGoalsTitle" }, "Your Reading Goals"),
            h("button", {
                class: "link-btn", type: "button",
                onclick: () => {
                    editForm.classList.toggle("hidden");
                    yearlyInput.focus();
                }
            }, "Edit goals")),
        h("div", { class: "year-goal" },
            h("span", { class: "label" }, "Books this year"),
            h("div", { class: "goal-number" }, String(done), h("span", {}, ` ${done === 1 ? "book" : "books"} finished`)),
            h("div", { class: "year-goal-bar" }, progressBar(pct), h("span", {}, `${pct}%`)),
            h("p", { class: "goal-foot" }, left ? `${fmt.plural(left, "book")} more to go · goal ${yearlyGoal}` : "Goal reached! 🎉")),
        shown.length
            ? h("div", { class: "goal-covers", "aria-label": "Finished this year" },
                shown.map((b) => h("a", { href: bookHref(b.id), title: b.title, "aria-label": b.title }, cover(b, "sm"))),
                finished.length > shown.length ? h("a", { class: "goal-more", href: "#/library?status=Read" }, `+${finished.length - shown.length}`) : null)
            : h("p", { class: "hint" }, "Books you finish this year line up here."),
        h("p", { class: "goal-month" }, `This month: ${booksFinished({ year, month }).length} / ${monthlyGoal} books`),
        state.customGoals.length ? h("ul", { class: "goal-list" }, state.customGoals.map(customGoalRow)) : null,
        editForm,
        h("button", { class: "btn add-goal-btn", type: "button", onclick: () => openGoalDialog() }, icon("plus"), "Add another goal")
    );
}

function customGoalRow(goal) {
    const { done, percent: pct } = goalProgress(goal);
    const unit = goal.metric === "pages" ? "pages" : goal.target === 1 ? "book" : "books";
    const scope = [goal.period === "month" ? "This month" : "This year", goal.filterValue].filter(Boolean).join(" · ");
    return h("li", { class: `custom-goal${done >= goal.target ? " is-done" : ""}` },
        h("div", { class: "custom-goal-head" },
            h("div", { style: { minWidth: 0 } },
                h("h3", {}, goalTitle(goal)),
                h("p", { class: "sub" }, scope)),
            h("div", { class: "custom-goal-actions" },
                h("button", { class: "icon-btn", type: "button", "aria-label": `Edit goal ${goalTitle(goal)}`, title: "Edit", onclick: () => openGoalDialog(goal) }, icon("edit")),
                h("button", {
                    class: "icon-btn", type: "button", "aria-label": `Delete goal ${goalTitle(goal)}`, title: "Delete",
                    onclick: async () => {
                        if (!(await confirmDialog({ title: "Delete this goal?", text: `"${goalTitle(goal)}" will be removed. Your books aren't affected.` }))) return;
                        try {
                            await deleteCustomGoal(goal.id);
                            toast("Goal deleted");
                        } catch (error) {
                            toast(error.message, { error: true });
                        }
                    }
                }, icon("trash")))),
        h("div", { class: "custom-goal-bar" },
            progressBar(pct, { thin: true }),
            h("span", { class: "goal-number-sm" }, `${fmt.num(done)} / ${fmt.num(goal.target)} ${unit}`)),
        done >= goal.target ? h("p", { class: "goal-foot" }, "Goal reached! 🎉") : null
    );
}

// ---------- Quote of the day ----------

function quoteCard() {
    const all = state.books.flatMap((b) => b.quotes.map((text) => ({ text, book: b })))
        .sort((a, b) => a.book.id.localeCompare(b.book.id) || a.text.localeCompare(b.text)); // stable order, so the pick only changes daily
    const now = new Date();
    const dayNumber = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    const pick = all.length ? all[dayNumber % all.length] : null;

    return h("section", { class: "card dash-card dash-quote", "aria-labelledby": "dashQuoteTitle" },
        h("div", { class: "dash-card-head" }, h("h2", { id: "dashQuoteTitle" }, "Quote of the Day")),
        pick
            ? h("figure", { class: "day-quote" },
                h("blockquote", {}, pick.text),
                h("figcaption", {}, "— ", h("a", { href: bookHref(pick.book.id) }, pick.book.title), `, ${pick.book.author}`))
            : h("p", { class: "dash-empty" }, "Save favourite lines in a book's Review. A new one shows here every day."),
        all.length > 1 ? h("p", { class: "dash-foot" }, `A new quote every day · ${fmt.plural(all.length, "quote")} saved`) : null
    );
}

// ---------- Next Up ----------

function nextUpCard() {
    const picks = nextUpBooks();
    const ids = picks.map((b) => b.id);

    const slots = Array.from({ length: NEXT_UP_MAX }, (_, i) => {
        const book = picks[i];
        if (!book) {
            return h("li", { class: "next-slot" },
                h("button", { type: "button", class: "next-add", "aria-label": "Add a book to Next Up", onclick: () => openNextUpPicker(ids) }, icon("plus")));
        }
        return h("li", { class: "next-slot" },
            h("div", { class: "next-book" },
                h("a", { href: bookHref(book.id), title: book.title, "aria-label": book.title }, cover(book, "md")),
                h("button", {
                    type: "button", class: "next-remove", "aria-label": `Remove ${book.title} from Next Up`, title: "Remove",
                    onclick: async () => {
                        try {
                            await saveNextUp(ids.filter((id) => id !== book.id));
                        } catch (error) {
                            toast(error.message, { error: true });
                        }
                    }
                }, icon("close"))),
            h("span", { class: "next-title" }, book.title));
    });

    return h("section", { class: "card dash-card dash-next", "aria-labelledby": "dashNextTitle" },
        h("div", { class: "dash-card-head" },
            h("h2", { id: "dashNextTitle" }, "Next Up"),
            h("a", { href: "#/library?status=To%20Be%20Read" }, "Your TBR")),
        h("ol", { class: "next-slots" }, slots),
        h("p", { class: "dash-foot" }, picks.length ? "Your next reads, in order. Start one by logging your reading." : "Pick your next reads from your TBR.")
    );
}

function openNextUpPicker(currentIds) {
    const choices = state.books.filter((b) => b.status === "To Be Read" && !currentIds.includes(b.id))
        .sort((a, b) => a.title.localeCompare(b.title));

    const addNew = h("button", { type: "button", class: "link-btn left", onclick: () => { m.close(); openAddBook(); } }, "Add a new book to your TBR");

    const m = modal({
        title: "Add to Next Up",
        body: choices.length
            ? h("div", { class: "picker-list" },
                choices.map((b) => h("button", {
                    type: "button", class: "picker-row",
                    onclick: async () => {
                        m.close();
                        try {
                            await saveNextUp([...currentIds, b.id]);
                            toast(`"${b.title}" is up next`);
                        } catch (error) {
                            toast(error.message, { error: true });
                        }
                    }
                },
                    cover(b, "xs"),
                    h("span", { class: "picker-text" }, h("strong", {}, b.title), h("small", {}, b.author)),
                    icon("plus"))))
            : h("p", { class: "empty-sm" }, "Every To Be Read book is already in Next Up, or your TBR is empty."),
        footer: [addNew]
    });
}

// ---------- Most recent entries ----------

function recentEntriesCard() {
    const entries = state.activities.slice(0, 4);
    return h("section", { class: "card dash-card dash-entries", "aria-labelledby": "dashEntriesTitle" },
        h("div", { class: "dash-card-head" }, h("h2", { id: "dashEntriesTitle" }, "Most Recent Entries")),
        entries.length
            ? h("ul", { class: "entries" }, entries.map((a) => {
                const book = getBook(a.book_id) || { title: a.book_title, author: "" };
                const body = [
                    cover(book, "sm"),
                    h("span", { class: "entry-text" },
                        h("strong", { class: "entry-date" }, dayLabel(a.session_date || a.created_at)),
                        h("span", { class: "entry-pages" }, a.pages_read > 0 ? `+${fmt.plural(a.pages_read, "page")} read` : "Journal note"),
                        h("span", { class: "entry-book" }, book.title),
                        a.note ? h("span", { class: "entry-note" }, a.note) : null)
                ];
                return h("li", {}, book.id
                    ? h("a", { class: "entry", href: bookHref(book.id) }, body)
                    : h("div", { class: "entry" }, body));
            }))
            : h("div", { class: "dash-empty" },
                h("p", {}, "Your journal entries will show up here."),
                h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => openLogReading() }, icon("pen"), "Log your reading"))
    );
}

function openGoalDialog(goal = null) {
    const field = (id, label, control) => h("div", { class: "field" }, h("label", { for: id }, label), control);
    const select = (id, options, value) =>
        h("select", { class: "select", id }, options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)));

    const name = h("input", { class: "input", id: "cgName", maxlength: 100, value: goal?.title || "", placeholder: "Optional, e.g. Classics catch-up", autocomplete: "off" });
    const target = h("input", { class: "input", id: "cgTarget", type: "number", min: 1, inputmode: "numeric", value: goal?.target ?? "", placeholder: "10" });
    const metric = select("cgMetric", [["books", "Books"], ["pages", "Pages"]], goal?.metric || "books");
    const period = select("cgPeriod", [["year", "This year"], ["month", "This month"]], goal?.period || "year");
    const filterType = select("cgFilter", [["", "Any book"], ...Object.entries(GOAL_FILTER_LABELS)], goal?.filterType || "");
    const filterValue = h("select", { class: "select", id: "cgFilterValue" });
    const valueField = field("cgFilterValue", "Which one", filterValue);

    const choices = {
        genre: () => [...new Set([...genreOptions("genres"), ...genreOptions("subgenres")])],
        format: () => FORMATS,
        age: () => AGE_CATEGORIES
    };
    const syncValues = () => {
        const type = filterType.value;
        valueField.classList.toggle("hidden", !type);
        if (!type) return;
        const options = choices[type]();
        const current = goal?.filterType === type ? goal.filterValue : options[0];
        filterValue.replaceChildren(...[...new Set([current, ...options])].map((o) => h("option", { value: o, selected: o === current }, o)));
    };
    filterType.addEventListener("change", syncValues);
    syncValues();

    modal({
        title: goal ? "Edit goal" : "Add a reading goal",
        size: "sm",
        submitLabel: goal ? "Save goal" : "Add goal",
        body: h("div", { class: "stack" },
            h("div", { class: "field-row" }, field("cgTarget", "Target", target), field("cgMetric", "Count", metric)),
            h("div", { class: "field-row" }, field("cgPeriod", "When", period), field("cgFilter", "Only count", filterType)),
            valueField,
            field("cgName", "Name", name),
            h("p", { class: "hint" }, "Books count once they're marked Read with a finish date in that month or year. Pages add up the page counts of those books.")
        ),
        initialFocus: target,
        async onSubmit({ setError }) {
            const n = Number(target.value);
            const max = metric.value === "pages" ? 1000000 : 1000;
            if (!Number.isInteger(n) || n < 1 || n > max) return setError(`Target must be a whole number from 1 to ${max.toLocaleString()}.`), false;
            await saveCustomGoal({
                title: name.value.trim(),
                metric: metric.value,
                period: period.value,
                target: n,
                filterType: filterType.value || null,
                filterValue: filterType.value ? filterValue.value : null
            }, goal?.id);
            toast(goal ? "Goal saved" : "Goal added");
        }
    });
}
