// Statistics: the longer-term picture. A summary row, books read per month, genres, and average completion.
import { state, percent, booksFinished, readingStreak } from "./store.js";
import { h, fmt, attachTooltip, stars } from "./ui.js";
import { loadingSkeleton } from "./dashboard.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function renderStatistics() {
    if (!state.loaded) return loadingSkeleton();
    const year = new Date().getFullYear();

    return h("div", {},
        h("div", { class: "page-head" },
            h("div", {},
                h("h1", {}, "Statistics"),
                h("p", {}, state.books.length ? "Your reading, in numbers." : "Add and finish some books to see your stats."))),
        h("div", { class: "stat-summary" }, summaryTiles(year)),
        h("div", { class: "dash-grid stats-grid section" }, monthlyCard(), genresCard(), completionCard())
    );
}

function summaryTiles(year) {
    const s = state.statistics || {};
    const rated = state.books.filter((b) => b.status === "Read" && b.rating);
    const avg = rated.length ? rated.reduce((sum, b) => sum + b.rating, 0) / rated.length : 0;
    const streak = readingStreak();
    const tile = (label, value, sub, extra = null) =>
        h("div", { class: "card dash-card dash-stat stat-tile" },
            h("span", { class: "dash-stat-label" }, label),
            h("span", { class: "dash-stat-value" }, value),
            extra,
            h("span", { class: "dash-stat-sub" }, sub));

    return [
        tile("Finished this year", fmt.num(booksFinished({ year }).length), `${fmt.plural(booksFinished().length, "book")} all time`),
        tile("Pages this month", fmt.num(s.pagesThisMonth), `${fmt.num(s.pagesThisWeek)} this week`),
        tile("Average rating", avg ? avg.toFixed(1) : "—", rated.length ? `from ${fmt.plural(rated.length, "rated book")}` : "rate a finished book", avg ? stars(Math.round(avg)) : null),
        tile("Reading streak", fmt.num(streak), streak === 1 ? "day in a row" : "days in a row")
    ];
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
            ? h("div", { class: "vbars", role: "list", style: { gridTemplateColumns: `repeat(${top.length}, minmax(0, 1fr))` } }, top.map(([label, value]) => {
                const col = h("div", { class: "vbar", role: "listitem", "aria-label": `${label}: ${fmt.plural(value, "book")}` },
                    h("span", { class: "vbar-value" }, value),
                    h("div", { class: "vbar-track" }, h("div", { class: "vbar-fill", style: { height: `${(value / max) * 100}%` } })),
                    h("span", { class: "vbar-label", "aria-hidden": "true" }, label)
                );
                attachTooltip(col, `${label}: ${fmt.plural(value, "book")}`);
                return col;
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
