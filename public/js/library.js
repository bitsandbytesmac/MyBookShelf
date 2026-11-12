import { state, percent, STATUSES, FORMATS } from "./store.js";
import { h, icon, cover, progressBar, statusBadge, stars, fmt } from "./ui.js";
import { openAddBook } from "./dialogs.js";
import { loadingSkeleton } from "./dashboard.js";

const SORTS = {
    recent: { label: "Recently added", fn: (a, b) => Number(b.id) - Number(a.id) },
    title: { label: "Title A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
    author: { label: "Author A–Z", fn: (a, b) => a.author.localeCompare(b.author) },
    progress: { label: "Progress", fn: (a, b) => percent(b) - percent(a) },
    rating: { label: "Rating", fn: (a, b) => (b.rating || 0) - (a.rating || 0) }
};

const filters = { query: "", status: "All", genre: "All", format: "All", sort: "recent" };

export function renderLibrary(params) {
    if (!state.loaded) return loadingSkeleton();
    if (params.get("status")) filters.status = params.get("status");

    const books = state.books;
    const allGenres = [...new Set(books.flatMap((b) => [...b.genres, ...b.subgenres]))].sort((a, b) => a.localeCompare(b));
    if (filters.genre !== "All" && !allGenres.includes(filters.genre)) filters.genre = "All";

    const results = h("div", {});
    const update = () => results.replaceChildren(...renderResults());

    // Status tabs
    const tabs = h("div", { class: "status-tabs", role: "tablist", "aria-label": "Book status" });
    for (const status of ["All", ...STATUSES, "Favorites"]) {
        const count = status === "All" ? books.length
            : status === "Favorites" ? books.filter((b) => b.isFavorite).length
                : books.filter((b) => b.status === status).length;
        const btn = h("button", {
            type: "button", role: "tab",
            class: filters.status === status ? "active" : "",
            "aria-selected": String(filters.status === status),
            onclick: () => {
                filters.status = status;
                tabs.querySelectorAll("button").forEach((b) => {
                    b.classList.toggle("active", b === btn);
                    b.setAttribute("aria-selected", String(b === btn));
                });
                history.replaceState(null, "", "#/library");
                update();
            }
        }, status === "Favorites" ? "♥ Favorites" : status, h("span", { class: "count" }, count));
        tabs.append(btn);
    }

    const select = (label, key, options) =>
        h("select", {
            class: "select", "aria-label": label,
            onchange: (e) => {
                filters[key] = e.target.value;
                update();
            }
        }, options.map(([value, text]) => h("option", { value, selected: filters[key] === value }, text)));

    update();

    return h("div", {},
        h("div", { class: "page-head" },
            h("div", {},
                h("h1", {}, "Library"),
                h("p", {}, books.length ? `${fmt.plural(books.length, "book")} on your shelf` : "Your shelf is empty")
            ),
            h("button", { class: "btn btn-primary", type: "button", onclick: openAddBook }, icon("plus"), "Add a book")
        ),
        tabs,
        h("div", { class: "toolbar" },
            h("div", { class: "search" }, icon("search"),
                h("input", {
                    class: "input", type: "search", placeholder: "Search title or author", value: filters.query, "aria-label": "Search library",
                    oninput: (e) => {
                        filters.query = e.target.value;
                        update();
                    }
                })),
            select("Genre", "genre", [["All", "All genres"], ...allGenres.map((g) => [g, g])]),
            select("Format", "format", [["All", "All formats"], ...FORMATS.map((f) => [f, f])]),
            select("Sort", "sort", Object.entries(SORTS).map(([k, s]) => [k, s.label]))
        ),
        results
    );
}

function renderResults() {
    if (!state.books.length) {
        return [h("div", { class: "card empty" },
            h("h3", {}, "Your To Be Read starts here"),
            h("p", {}, "Search for a book and we'll fill in the cover, author and summary."),
            h("button", { class: "btn btn-primary", type: "button", onclick: openAddBook }, icon("plus"), "Add a book")
        )];
    }

    const q = filters.query.trim().toLowerCase();
    const list = state.books.filter((b) => {
        if (q && !b.title.toLowerCase().includes(q) && !b.author.toLowerCase().includes(q)) return false;
        if (filters.genre !== "All" && !b.genres.includes(filters.genre) && !b.subgenres.includes(filters.genre)) return false;
        if (filters.format !== "All" && b.format !== filters.format) return false;
        if (filters.status === "Favorites") return b.isFavorite;
        if (filters.status !== "All") return b.status === filters.status;
        return true;
    }).sort(SORTS[filters.sort].fn);

    if (!list.length) {
        return [h("div", { class: "card empty" }, h("h3", {}, "No books here yet"), h("p", {}, "Try a different filter or search."))];
    }

    return [
        h("p", { class: "result-count" }, fmt.plural(list.length, "book")),
        h("div", { class: "book-grid" }, list.map(bookTile))
    ];
}

export function bookTile(book) {
    const pct = percent(book);
    const coverNode = cover(book, "md");
    if (book.isFavorite) coverNode.append(h("span", { class: "fav-badge", "aria-label": "Favorite" }, icon("heart", { filled: true })));

    return h("button", { class: "book-tile", type: "button", onclick: () => (location.hash = `#/book/${book.id}`) },
        coverNode,
        h("div", {},
            h("h3", {}, book.title),
            h("p", { class: "author" }, book.author),
            h("div", { class: "tile-meta" }, statusBadge(book.status)),
            ["Reading", "Paused"].includes(book.status) && book.totalPages
                ? h("div", { class: "tile-meta" }, progressBar(pct, { thin: true }), h("small", {}, `${pct}%`))
                : book.rating
                    ? h("div", { class: "tile-meta" }, stars(book.rating))
                    : null
        )
    );
}
