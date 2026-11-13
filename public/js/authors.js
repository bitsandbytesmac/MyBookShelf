// Authors: every author on the shelf, and a page per author with all their books and series.
import { state, authorsList, findAuthor, seriesList, authorNames, bySeriesOrder } from "./store.js";
import { h, icon, fmt, authorAvatar, authorHref, seriesHref, coverStack, seriesBadge, progressBar } from "./ui.js";
import { bookTile } from "./library.js";
import { loadingSkeleton } from "./dashboard.js";

const SORTS = {
    books: { label: "Most books", fn: (a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name) },
    name: { label: "Name A–Z", fn: (a, b) => a.name.localeCompare(b.name) },
    recent: { label: "Recently added", fn: (a, b) => newest(b) - newest(a) }
};
const newest = (author) => Math.max(...author.books.map((b) => Number(b.id) || 0));

const view = { query: "", sort: "books" };

export function renderAuthors() {
    if (!state.loaded) return loadingSkeleton();

    const authors = authorsList();
    const results = h("div", {});
    const update = () => results.replaceChildren(...authorResults(authors));
    update();

    return h("div", {},
        h("div", { class: "page-head" },
            h("div", {},
                h("h1", {}, "Authors"),
                h("p", {}, authors.length
                    ? `${fmt.plural(authors.length, "author")} on your shelf`
                    : "Authors appear here as you add books")
            )
        ),
        authors.length ? h("div", { class: "toolbar" },
            h("div", { class: "search" }, icon("search"),
                h("input", {
                    class: "input", type: "search", placeholder: "Search authors", value: view.query, "aria-label": "Search authors",
                    oninput: (e) => {
                        view.query = e.target.value;
                        update();
                    }
                })),
            h("select", {
                class: "select", "aria-label": "Sort authors",
                onchange: (e) => {
                    view.sort = e.target.value;
                    update();
                }
            }, Object.entries(SORTS).map(([k, s]) => h("option", { value: k, selected: view.sort === k }, s.label)))
        ) : null,
        results
    );
}

function authorResults(authors) {
    if (!authors.length) {
        return [h("div", { class: "card empty" },
            h("h3", {}, "No authors yet"),
            h("p", {}, "Every book you add puts its author here, with all their books together."),
            h("a", { class: "btn btn-primary", href: "#/library" }, "Go to library"))];
    }

    const q = view.query.trim().toLowerCase();
    const list = authors.filter((a) => !q || a.name.toLowerCase().includes(q)).sort(SORTS[view.sort].fn);
    if (!list.length) return [h("div", { class: "card empty" }, h("h3", {}, "No matching authors"), h("p", {}, "Try a different name."))];

    return [h("div", { class: "author-grid" }, list.map(authorCard))];
}

function authorCard(author) {
    const read = author.books.filter((b) => b.status === "Read").length;
    return h("a", { class: "card author-card", href: authorHref(author.name) },
        authorAvatar(author.name),
        h("div", { class: "author-card-body" },
            h("h3", {}, author.name),
            h("p", { class: "sub" }, `${fmt.plural(author.books.length, "book")} · ${read} read`)
        ),
        coverStack(author.books, 3)
    );
}

export function renderAuthor(params, id) {
    if (!state.loaded) return loadingSkeleton();

    let name = "";
    try {
        name = decodeURIComponent(id || "");
    } catch {
        /* malformed link */
    }
    const author = findAuthor(name);
    const back = h("a", { class: "back-link", href: "#/authors" }, icon("back"), "Authors");

    if (!author) {
        return h("div", {}, back, h("div", { class: "card empty" },
            h("h3", {}, "Author not found"),
            h("p", {}, "There are no books by this author on your shelf anymore."),
            h("a", { class: "btn", href: "#/authors" }, "All authors")));
    }

    const books = author.books;
    const read = books.filter((b) => b.status === "Read");
    const rated = books.filter((b) => b.rating);
    const avg = rated.length ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1) : null;
    const pages = read.reduce((s, b) => s + (b.totalPages || 0), 0);

    const series = seriesList().filter((s) => s.books.some((b) => authorNames(b).some((n) => n.toLowerCase().replace(/\s+/g, " ") === author.key)));

    const stat = (value, label) => h("div", { class: "author-stat" }, h("strong", {}, value), h("span", {}, label));

    // Books grouped: series books in reading order first, then standalones by title.
    const ordered = [...books].sort((a, b) => {
        if (!!a.series !== !!b.series) return a.series ? -1 : 1;
        if (a.series && b.series && a.series !== b.series) return a.series.localeCompare(b.series);
        return a.series ? bySeriesOrder(a, b) : a.title.localeCompare(b.title);
    });

    return h("div", {},
        back,
        h("section", { class: "author-hero" },
            authorAvatar(author.name, "lg"),
            h("div", {},
                h("h1", {}, author.name),
                h("div", { class: "author-stats" },
                    stat(fmt.num(books.length), books.length === 1 ? "book" : "books"),
                    stat(fmt.num(read.length), "read"),
                    stat(avg ? `★ ${avg}` : "—", "avg rating"),
                    stat(fmt.num(pages), "pages read")
                )
            )
        ),
        series.length ? h("section", { class: "section" },
            h("div", { class: "section-head" }, h("h2", {}, "Series")),
            h("div", { class: "series-chips" }, series.map((s) =>
                h("a", { class: "card series-chip", href: seriesHref(s.name) },
                    h("div", {},
                        h("strong", {}, s.name),
                        h("span", { class: "sub" }, `${s.read} of ${fmt.plural(s.books.length, "book")} read`)),
                    seriesBadge(s.status),
                    progressBar(s.percent, { thin: true })
                )))
        ) : null,
        h("section", { class: "section" },
            h("div", { class: "section-head" }, h("h2", {}, "Books")),
            h("div", { class: "book-grid" }, ordered.map(bookTile))
        )
    );
}
