// Physical Books (#/physical): every book ticked "Physical book" in Add/Edit details, on the same
// wooden bookcase as the Library's Shelf view. Same markup and behaviour as public/js/physical.js.
import { useMemo, useState } from "react";
import type { Book } from "../../api/types";
import { Bookcase } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { Icon } from "../../components/Icon";
import { STATUSES } from "../../domain/constants";
import { bySeriesOrder } from "../../domain/shelf";
import { useStore } from "../../store/useStore";

const SORTS: Record<string, { label: string; fn: (a: Book, b: Book) => number }> = {
    title: { label: "Title A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
    author: { label: "Author A–Z", fn: (a, b) => a.author.localeCompare(b.author) || a.title.localeCompare(b.title) },
    series: { label: "Series order", fn: (a, b) => (a.series ? 0 : 1) - (b.series ? 0 : 1) || (a.series || "").localeCompare(b.series || "") || bySeriesOrder(a, b) },
    recent: { label: "Recently added", fn: (a, b) => Number(b.id) - Number(a.id) }
};

type Filters = { query: string; status: string; sort: string };
// Kept while you visit a book and come back.
let remembered: Filters = { query: "", status: "All", sort: "title" };

export function PhysicalPage() {
    const allBooks = useStore((s) => s.books);
    const books = useMemo(() => allBooks.filter((b) => b.isPhysical), [allBooks]);
    const [filters, setFilters] = useState(remembered);
    const update = (change: Partial<Filters>) => setFilters((f) => (remembered = { ...f, ...change }));

    const list = useMemo(() => {
        const q = filters.query.trim().toLowerCase();
        return books.filter((b) => {
            if (q && ![b.title, b.author, b.series].some((v) => (v || "").toLowerCase().includes(q))) return false;
            return filters.status === "All" || b.status === filters.status;
        }).sort(SORTS[filters.sort].fn);
    }, [books, filters]);

    return (
        <div>
            <div className="page-head">
                <div>
                    <h1>Physical Books</h1>
                    <p>{books.length ? `${fmt.plural(books.length, "physical book")} on your shelf` : "The books you can hold in your hands"}</p>
                </div>
            </div>
            {books.length
                ? (
                    <div className="toolbar">
                        <div className="search">
                            <Icon name="search" />
                            <input className="input" type="search" placeholder="Search title, author or series" aria-label="Search physical books"
                                value={filters.query} onChange={(e) => update({ query: e.target.value })} />
                        </div>
                        <select className="select" aria-label="Status" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
                            {["All", ...STATUSES].map((s) => <option key={s} value={s}>{s === "All" ? "All statuses" : s}</option>)}
                        </select>
                        <select className="select" aria-label="Sort" value={filters.sort} onChange={(e) => update({ sort: e.target.value })}>
                            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                        </select>
                    </div>
                )
                : null}
            {!books.length
                ? (
                    <div className="card empty">
                        <h3>No physical books yet</h3>
                        <p>Open a book, choose Edit details and tick “Physical book” to put it on this shelf.</p>
                        <a className="btn btn-primary" href="#/library"><Icon name="book" />Go to Library</a>
                    </div>
                )
                : !list.length
                    ? <div className="card empty"><h3>No physical books match</h3><p>Try a different search or status.</p></div>
                    : <>
                        <p className="result-count">{fmt.plural(list.length, "book")}</p>
                        <Bookcase books={list} />
                    </>}
        </div>
    );
}
