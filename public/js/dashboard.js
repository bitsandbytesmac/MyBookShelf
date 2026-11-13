import { state, percent, booksFinished, saveGoals } from "./store.js";
import { h, icon, cover, progressBar, fmt, toast, attachTooltip } from "./ui.js";
import { openAddBook } from "./dialogs.js";
import { openCustomize } from "./theme.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

const openBook = (id) => (location.hash = `#/book/${id}`);

export function renderDashboard() {
    if (!state.loaded) return loadingSkeleton();

    const user = currentUser();
    const books = state.books;
    const byStatus = (s) => books.filter((b) => b.status === s);
    const reading = byStatus("Reading");

    const head = h("div", { class: "page-head" },
        h("div", {},
            h("h1", {}, `${greeting()}${user.username ? `, ${user.username}` : ""}`),
            h("p", {}, books.length ? "Here's your reading life at a glance." : "Your shelf is waiting for its first book.")
        ),
        h("button", { class: "btn btn-ghost customize-btn", type: "button", onclick: openCustomize, "aria-label": "Customize colours" },
            icon("palette"), h("span", { class: "label" }, "Customize"))
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

    // 1–3. Status tiles
    const tile = (cls, label, count, sub, href, iconName) =>
        h("a", { class: `tile ${cls}`, href },
            icon(iconName, { cls: "tile-icon" }),
            h("span", { class: "tile-label" }, label),
            h("span", { class: "tile-value" }, fmt.num(count)),
            h("span", { class: "tile-sub" }, sub)
        );

    const tiles = h("div", { class: "tiles" },
        tile("tile-reading", "Currently reading", reading.length, "stories in progress", "#/library?status=Reading", "book"),
        tile("tile-tbr", "To Be Read", byStatus("To Be Read").length, "waiting on your shelf", "#/library?status=To%20Be%20Read", "bookmark"),
        tile("tile-read", "Completed", byStatus("Read").length, "books finished", "#/library?status=Read", "check")
    );

    // Currently reading list
    const readingSection = h("section", { class: "section" },
        h("div", { class: "section-head" },
            h("h2", {}, "Currently reading"),
            reading.length > 4 ? h("a", { href: "#/library?status=Reading" }, "See all") : null
        ),
        reading.length
            ? h("div", { class: "reading-list" }, reading.slice(0, 4).map(readingCard))
            : h("div", { class: "card empty-sm" }, "Nothing in progress. ",
                h("a", { href: "#/library?status=To%20Be%20Read" }, "Pick your next read from your TBR"), ".")
    );

    // 5–6. Goals + books read per month
    const goalsGrid = h("div", { class: "dash-grid section" }, goalsCard(), monthlyCard());

    // 4. Statistics
    const statsGrid = h("section", { class: "section" },
        h("div", { class: "section-head" }, h("h2", {}, "Statistics")),
        h("div", { class: "dash-grid" }, genresCard(), completionCard())
    );

    // 7. Quotes
    return h("div", {}, head, tiles, readingSection, goalsGrid, statsGrid, quotesSection());
}

function readingCard(book) {
    const pct = percent(book);
    return h("article", { class: "card reading-item", tabindex: 0, onclick: () => openBook(book.id), onkeydown: (e) => e.key === "Enter" && openBook(book.id) },
        cover(book, "sm"),
        h("div", { class: "reading-body" },
            h("h3", {}, book.title),
            h("span", { class: "author" }, book.author),
            h("div", { class: "reading-meta" },
                h("span", {}, book.totalPages ? `Page ${fmt.num(book.currentPage)} of ${fmt.num(book.totalPages)}` : "No page count yet"),
                h("strong", {}, `${pct}%`)
            ),
            progressBar(pct)
        )
    );
}

function goalBlock(label, done, goal) {
    const pct = Math.min(100, Math.round((done / goal) * 100));
    const left = Math.max(goal - done, 0);
    return h("div", { class: "goal-block" },
        h("span", { class: "label" }, label),
        h("div", { class: "goal-number" }, String(done), h("span", {}, ` / ${goal} books`)),
        progressBar(pct),
        h("p", { class: "goal-foot" }, left ? `${fmt.plural(left, "book")} to go · ${pct}%` : "Goal reached! 🎉")
    );
}

function goalsCard() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { monthlyGoal, yearlyGoal } = state.goals;

    const monthlyInput = h("input", { class: "input", type: "number", min: 1, max: 100, value: monthlyGoal, id: "gMonthly" });
    const yearlyInput = h("input", { class: "input", type: "number", min: 1, max: 1000, value: yearlyGoal, id: "gYearly" });

    const editForm = h("form", { class: "goal-edit hidden" },
        h("div", { class: "field" }, h("label", { for: "gMonthly" }, "Monthly"), monthlyInput),
        h("div", { class: "field" }, h("label", { for: "gYearly" }, "Yearly"), yearlyInput),
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

    return h("section", { class: "card goal" },
        h("div", { class: "review-head" },
            h("h3", {}, "Reading goals"),
            h("button", {
                class: "link-btn", type: "button",
                onclick: () => {
                    editForm.classList.toggle("hidden");
                    monthlyInput.focus();
                }
            }, "Edit goals")
        ),
        h("div", { class: "goal-row" },
            goalBlock(now.toLocaleDateString(undefined, { month: "long" }), booksFinished({ year, month }).length, monthlyGoal),
            goalBlock(String(year), booksFinished({ year }).length, yearlyGoal)
        ),
        editForm
    );
}

function monthlyCard() {
    const now = new Date();
    const year = now.getFullYear();
    const thisMonth = now.getMonth();
    const counts = MONTHS.map((_, i) => booksFinished({ year, month: i + 1 }).length);
    const max = Math.max(1, ...counts);
    const total = counts.reduce((a, b) => a + b, 0);

    const chart = h("div", { class: "months", role: "list", "aria-label": `Books read per month in ${year}` }, counts.map((count, i) => {
        const col = h("div", { class: `month${i === thisMonth ? " current" : ""}`, role: "listitem", "aria-label": `${MONTHS[i]}: ${count}` },
            h("span", { class: "month-val" }, count || ""),
            h("div", { class: "month-bar", style: { height: `${(count / max) * 100}%` } }),
            h("span", { class: "month-label" }, MONTHS[i].charAt(0))
        );
        attachTooltip(col, `${MONTHS[i]} ${year}: ${fmt.plural(count, "book")}`);
        return col;
    }));

    return h("section", { class: "card card-pad" },
        h("h3", {}, "Books read"),
        h("p", { class: "sub" },
            `${fmt.plural(counts[thisMonth], "book")} this month · ${fmt.plural(total, "book")} in ${year}`),
        chart
    );
}

function genresCard() {
    const read = state.books.filter((b) => b.status === "Read");
    const source = read.length ? read : state.books;
    const counts = {};
    for (const book of source) for (const g of book.genres) counts[g] = (counts[g] || 0) + 1;
    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = rows.slice(0, 7);
    const rest = rows.slice(7).reduce((s, [, c]) => s + c, 0);
    if (rest) top.push(["Other", rest]);
    const max = Math.max(1, ...top.map(([, c]) => c));

    return h("section", { class: "card card-pad" },
        h("h3", {}, "Genres you've read"),
        h("p", { class: "sub" }, read.length
            ? `From ${fmt.plural(read.length, "finished book")}`
            : "No finished books yet — showing your whole shelf"),
        top.length
            ? h("div", { class: "hbars", role: "list" }, top.map(([label, value]) => {
                const row = h("div", { class: "hbar", role: "listitem" },
                    h("span", { class: "hbar-label" }, label),
                    h("div", { class: "hbar-track" }, h("div", { class: "hbar-fill", style: { width: `${(value / max) * 100}%` } })),
                    h("span", { class: "hbar-value" }, value)
                );
                attachTooltip(row, `${label}: ${fmt.plural(value, "book")}`);
                return row;
            }))
            : h("p", { class: "empty-sm" }, "Add genres to your books to see them here.")
    );
}

function completionCard() {
    const started = state.books.filter((b) => b.status !== "To Be Read" && b.totalPages > 0);
    const avg = started.length ? Math.round(started.reduce((s, b) => s + percent(b), 0) / started.length) : 0;
    const s = state.statistics || {};
    const radius = 52;
    const circumference = 2 * Math.PI * radius;

    const ring = h("div", { class: "ring", role: "img", "aria-label": `Average completion ${avg}%` });
    ring.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="${radius}" fill="none" style="stroke: var(--sage-soft)" stroke-width="12"/>
        <circle cx="60" cy="60" r="${radius}" fill="none" style="stroke: var(--sage)" stroke-width="12" stroke-linecap="round"
            stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - avg / 100)}"/>
    </svg>`;
    ring.append(h("span", { class: "ring-value" }, `${avg}%`));

    const count = (status) => state.books.filter((b) => b.status === status).length;

    return h("section", { class: "card card-pad" },
        h("h3", {}, "Average completion"),
        h("p", { class: "sub" }, started.length ? `Across ${fmt.plural(started.length, "book")} you've started` : "Start a book to see this"),
        h("div", { class: "completion" },
            ring,
            h("div", { class: "mini-stats" },
                h("span", {}, h("strong", {}, fmt.num(s.pagesThisWeek)), "pages this week"),
                h("span", {}, h("strong", {}, fmt.num(s.pagesThisMonth)), "pages this month"),
                h("span", {}, h("strong", {}, count("Paused")), "paused · ", h("strong", {}, count("DNF")), "DNF")
            )
        )
    );
}

function quotesSection() {
    const all = state.books.flatMap((b) => b.quotes.map((text) => ({ text, book: b })));
    const grid = h("div", { class: "quotes" });

    const render = () => {
        const picks = [...all].sort(() => Math.random() - 0.5).slice(0, 6);
        grid.replaceChildren(...picks.map(({ text, book }) =>
            h("figure", { class: "quote" },
                h("blockquote", {}, text),
                h("figcaption", {}, "— ", h("a", { href: `#/book/${book.id}` }, book.title), `, ${book.author}`)
            )
        ));
    };
    render();

    return h("section", { class: "section" },
        h("div", { class: "section-head" },
            h("h2", {}, "Favourite lines"),
            all.length > 6 ? h("button", { class: "link-btn", type: "button", onclick: render }, "Shuffle") : null
        ),
        all.length
            ? grid
            : h("div", { class: "card empty-sm" }, "Save quotes in a book's Review and your favourite lines will live here.")
    );
}
