// Physical Books (#/physical): every book ticked "Physical book" in Add/Edit details,
// standing on the same wooden bookcase as the Library's Shelf view.
import { state, STATUSES, bySeriesOrder } from "./store.js";
import { h, icon, fmt, bookcase } from "./ui.js";
import { loadingSkeleton } from "./dashboard.js";

const SORTS = {
    title: { label: "Title A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
    author: { label: "Author A–Z", fn: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title) },
    series: { label: "Series order", fn: (a, b) => (a.series ? 0 : 1) - (b.series ? 0 : 1) || (a.series || "").localeCompare(b.series || "") || bySeriesOrder(a, b) },
    recent: { label: "Recently added", fn: (a, b) => Number(b.id) - Number(a.id) }
};

const filters = { query: "", status: "All", sort: "title" };

export const physicalBooks = () => state.books.filter((b) => b.isPhysical);

export function renderPhysical() {
    if (!state.loaded) return loadingSkeleton();

    const books = physicalBooks();
    const results = h("div", {});
    const update = () => results.replaceChildren(...renderResults(books));

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
                h("h1", {}, "Physical Books"),
                h("p", {}, books.length ? `${fmt.plural(books.length, "physical book")} on your shelf` : "The books you can hold in your hands")
            )
        ),
        books.length
            ? h("div", { class: "toolbar" },
                h("div", { class: "search" }, icon("search"),
                    h("input", {
                        class: "input", type: "search", placeholder: "Search title, author or series", value: filters.query, "aria-label": "Search physical books",
                        oninput: (e) => {
                            filters.query = e.target.value;
                            update();
                        }
                    })),
                select("Status", "status", [["All", "All statuses"], ...STATUSES.map((s) => [s, s])]),
                select("Sort", "sort", Object.entries(SORTS).map(([k, s]) => [k, s.label])))
            : null,
        results
    );
}

function renderResults(books) {
    if (!books.length) {
        return [h("div", { class: "card empty" },
            h("h3", {}, "No physical books yet"),
            h("p", {}, "Open a book, choose Edit details and tick “Physical book” to put it on this shelf."),
            h("a", { class: "btn btn-primary", href: "#/library" }, icon("book"), "Go to Library")
        )];
    }

    const q = filters.query.trim().toLowerCase();
    const list = books.filter((b) => {
        if (q && ![b.title, b.author, b.series].some((v) => (v || "").toLowerCase().includes(q))) return false;
        return filters.status === "All" || b.status === filters.status;
    }).sort(SORTS[filters.sort].fn);

    if (!list.length) {
        return [h("div", { class: "card empty" }, h("h3", {}, "No physical books match"), h("p", {}, "Try a different search or status."))];
    }
    return [
        h("p", { class: "result-count" }, fmt.plural(list.length, "book")),
        bookcase(list)
    ];
}
