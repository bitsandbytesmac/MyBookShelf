// Series: progress through every series on the shelf, and a page per series in reading order.
import { state, seriesList, findSeries, percent } from "./store.js";
import { h, icon, cover, fmt, statusBadge, stars, progressBar, authorHref, seriesBadge, coverStack } from "./ui.js";
import { loadingSkeleton } from "./dashboard.js";

const FILTERS = ["All", "In progress", "Not started", "Completed"];
const view = { filter: "All" };

const openBook = (id) => (location.hash = `#/book/${id}`);
const bookNo = (book) => (book.seriesNumber ? `#${book.seriesNumber}` : "—");

export function renderSeries(params, id) {
    if (!state.loaded) return loadingSkeleton();
    return id ? seriesDetail(id) : seriesIndexPage();
}

// ---------- All series ----------

function seriesIndexPage() {
    const all = seriesList().sort((a, b) => a.name.localeCompare(b.name));
    const completed = all.filter((s) => s.status === "Completed").length;
    const results = h("div", {});

    const tabs = h("div", { class: "status-tabs", role: "tablist", "aria-label": "Series status" });
    const update = () => {
        const list = view.filter === "All" ? all : all.filter((s) => s.status === view.filter);
        results.replaceChildren(list.length
            ? h("div", { class: "series-grid" }, list.map(seriesCard))
            : h("div", { class: "card empty" }, h("h3", {}, `Nothing ${view.filter.toLowerCase()}`), h("p", {}, "Try another filter.")));
    };

    for (const f of FILTERS) {
        const count = f === "All" ? all.length : all.filter((s) => s.status === f).length;
        const btn = h("button", {
            type: "button", role: "tab", class: view.filter === f ? "active" : "", "aria-selected": String(view.filter === f),
            onclick: () => {
                view.filter = f;
                tabs.querySelectorAll("button").forEach((b) => {
                    b.classList.toggle("active", b === btn);
                    b.setAttribute("aria-selected", String(b === btn));
                });
                update();
            }
        }, f, h("span", { class: "count" }, count));
        tabs.append(btn);
    }

    if (all.length) update();

    return h("div", {},
        h("div", { class: "page-head" },
            h("div", {},
                h("h1", {}, "Series"),
                h("p", {}, all.length ? `${fmt.num(all.length)} series · ${completed} completed` : "Track every series you're working through")
            )
        ),
        all.length ? [tabs, results] : h("div", { class: "card empty" },
            h("h3", {}, "No series yet"),
            h("p", {}, "Open a book, choose Edit details and fill in Series and Book #. Books in the same series are grouped here in order, with your progress."),
            h("a", { class: "btn btn-primary", href: "#/library" }, "Go to library"))
    );
}

function seriesCard(series) {
    return h("a", { class: "card series-card", href: `#/series/${encodeURIComponent(series.name)}` },
        coverStack(series.books, 5),
        h("div", { class: "series-card-body" },
            h("div", { class: "series-card-title" },
                h("h3", {}, series.name),
                seriesBadge(series.status)),
            h("p", { class: "sub" }, series.authors.join(", ")),
            h("div", { class: "series-progress" },
                progressBar(series.percent, { thin: true }),
                h("small", {}, `${series.read}/${series.outOf} read · ${series.percent}%`)),
            series.next && series.status !== "Completed"
                ? h("p", { class: "series-next" }, h("span", {}, "Next up: "), `${bookNo(series.next)} ${series.next.title}`)
                : null
        )
    );
}

// ---------- One series ----------

function seriesDetail(id) {
    let name = "";
    try {
        name = decodeURIComponent(id);
    } catch {
        /* malformed link */
    }
    const series = findSeries(name);
    const back = h("a", { class: "back-link", href: "#/series" }, icon("back"), "Series");

    if (!series) {
        return h("div", {}, back, h("div", { class: "card empty" },
            h("h3", {}, "Series not found"),
            h("p", {}, "No books on your shelf belong to this series anymore."),
            h("a", { class: "btn", href: "#/series" }, "All series")));
    }

    const remaining = series.outOf - series.read;
    const missing = series.total ? Math.max(0, series.total - series.books.filter((b) => b.seriesNumber == null || Number.isInteger(b.seriesNumber)).length) : 0;

    return h("div", {},
        back,
        h("section", { class: "series-hero card card-pad" },
            h("div", { class: "series-hero-top" },
                h("div", {},
                    h("h1", {}, series.name),
                    h("p", { class: "by" }, "by ", series.authors.flatMap((a, i) => [i ? ", " : null, h("a", { href: authorHref(a) }, a)]))
                ),
                seriesBadge(series.status)
            ),
            h("div", { class: "series-hero-progress" },
                h("div", { class: "series-big-row" },
                    h("div", { class: "series-big" }, h("strong", {}, `${series.read}/${series.outOf}`), h("span", {}, ` ${series.outOf === 1 ? "book" : "books"} read`)),
                    h("span", { class: "series-pct" }, `${series.percent}%`)),
                progressBar(series.percent),
                h("p", { class: "sub" }, series.status === "Completed"
                    ? (series.total ? "You've finished the whole series. 🎉" : "You've finished every book you've added from this series. 🎉")
                    : `${fmt.plural(remaining, "book")} to go`
                        + (missing ? ` · ${fmt.plural(missing, "book")} not on your shelf yet` : "")),
                series.total ? null : h("p", { class: "hint" }, "Tip: set “Books in series” in a book's Edit details to track the whole series, e.g. 1 of 6.")
            ),
            series.next && series.status !== "Completed"
                ? h("button", { class: "series-upnext", type: "button", onclick: () => openBook(series.next.id) },
                    cover(series.next, "xs"),
                    h("span", {},
                        h("small", {}, series.next.status === "To Be Read" ? "Up next" : "Continue reading"),
                        h("strong", {}, `${bookNo(series.next)} · ${series.next.title}`)),
                    icon("arrow"))
                : null
        ),
        h("section", { class: "section" },
            h("div", { class: "section-head" }, h("h2", {}, "Reading order")),
            h("ol", { class: "series-list" }, series.books.map((book) => seriesRow(book, book === series.next)))
        )
    );
}

function seriesRow(book, isNext) {
    const pct = percent(book);
    const showProgress = ["Reading", "Paused"].includes(book.status) && book.totalPages;
    return h("li", {},
        h("button", { class: `card series-row${isNext ? " is-next" : ""}${book.status === "Read" ? " is-read" : ""}`, type: "button", onclick: () => openBook(book.id) },
            h("span", { class: "series-no" }, bookNo(book)),
            cover(book, "sm"),
            h("span", { class: "series-row-body" },
                h("strong", {}, book.title),
                h("span", { class: "sub" }, book.author),
                h("span", { class: "series-row-meta" },
                    statusBadge(book.status),
                    showProgress ? h("span", { class: "series-row-pct" }, progressBar(pct, { thin: true }), `${pct}%`) : null,
                    book.status === "Read" && book.rating ? stars(book.rating) : null,
                    isNext ? h("span", { class: "badge tag" }, "Next up") : null)
            ),
            icon("arrow", { cls: "series-row-arrow" })
        )
    );
}
