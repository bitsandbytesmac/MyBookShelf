// Library (#/library): status tabs, search, genre/format filters, sort, and the Shelf/Grid switch.
// Same markup and behaviour as public/js/library.js. The filters live in this module, so they're
// kept while you visit a book and come back (as in the vanilla app).
import { useEffect, useMemo, useState } from "react";
import type { Book } from "../../api/types";
import { Bookcase, Cover, ProgressBar, Stars, StatusBadge } from "../../components/BookBits";
import { fmt, seriesLabel } from "../../components/format";
import { Icon } from "../../components/Icon";
import { FORMATS, STATUSES } from "../../domain/constants";
import { percent } from "../../domain/readingRules";
import { bySeriesOrder } from "../../domain/shelf";
import { useStore } from "../../store/useStore";
import { openAddBook } from "../../app/actions";

type ViewMode = "shelf" | "grid";

// Shelf (covers standing on wooden shelves) is the default; Grid shows titles, status and progress.
// The choice is a per-browser convenience, so it lives in localStorage (and falls back to Shelf).
const VIEW_KEY = "libraryView";
function savedView(): ViewMode {
    try {
        return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "shelf";
    } catch {
        return "shelf";
    }
}

const SORTS: Record<string, { label: string; fn: (a: Book, b: Book) => number }> = {
    recent: { label: "Recently added", fn: (a, b) => Number(b.id) - Number(a.id) },
    title: { label: "Title A–Z", fn: (a, b) => a.title.localeCompare(b.title) },
    author: { label: "Author A–Z", fn: (a, b) => a.author.localeCompare(b.author) },
    progress: { label: "Progress", fn: (a, b) => percent(b) - percent(a) },
    rating: { label: "Rating", fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
    series: { label: "Series order", fn: (a, b) => (a.series ? 0 : 1) - (b.series ? 0 : 1) || (a.series || "").localeCompare(b.series || "") || bySeriesOrder(a, b) }
};

type Filters = { query: string; status: string; genre: string; format: string; sort: string };
let remembered: Filters = { query: "", status: "All", genre: "All", format: "All", sort: "recent" };

export function LibraryPage({ params }: { params: URLSearchParams }) {
    const books = useStore((s) => s.books);
    const [filters, setFilters] = useState<Filters>(remembered);
    const [view, setView] = useState<ViewMode>(savedView);

    const update = (change: Partial<Filters>) => setFilters((f) => (remembered = { ...f, ...change }));

    // A link like #/library?status=Reading (from the dashboard) opens that tab.
    const linkedStatus = params.get("status");
    useEffect(() => {
        if (linkedStatus) update({ status: linkedStatus });
    }, [linkedStatus]);

    const allGenres = useMemo(() => [...new Set(books.flatMap((b) => [...b.genres, ...b.subgenres]))].sort((a, b) => a.localeCompare(b)), [books]);
    const genre = filters.genre !== "All" && !allGenres.includes(filters.genre) ? "All" : filters.genre;

    const counts = useMemo(() => {
        const c: Record<string, number> = { All: books.length, Favorites: books.filter((b) => b.isFavorite).length };
        for (const s of STATUSES) c[s] = books.filter((b) => b.status === s).length;
        return c;
    }, [books]);

    const list = useMemo(() => {
        const q = filters.query.trim().toLowerCase();
        return books.filter((b) => {
            if (q && ![b.title, b.author, b.series].some((v) => (v || "").toLowerCase().includes(q))) return false;
            if (genre !== "All" && !b.genres.includes(genre) && !b.subgenres.includes(genre)) return false;
            if (filters.format !== "All" && b.format !== filters.format) return false;
            if (filters.status === "Favorites") return b.isFavorite;
            if (filters.status !== "All") return b.status === filters.status;
            return true;
        }).sort(SORTS[filters.sort].fn);
    }, [books, filters, genre]);

    const chooseView = (value: ViewMode) => {
        setView(value);
        try {
            localStorage.setItem(VIEW_KEY, value);
        } catch {
            /* private mode: just don't remember it */
        }
    };

    const select = (label: string, key: "genre" | "format" | "sort", value: string, options: [string, string][]) => (
        <select className="select" aria-label={label} value={value} onChange={(e) => update({ [key]: e.target.value })}>
            {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
        </select>
    );

    return (
        <div>
            <div className="page-head">
                <div>
                    <h1>Library</h1>
                    <p>{books.length ? `${fmt.plural(books.length, "book")} on your shelf` : "Your shelf is empty"}</p>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => openAddBook()}><Icon name="plus" />Add a book</button>
            </div>

            <div className="status-tabs" role="tablist" aria-label="Book status">
                {["All", ...STATUSES, "Favorites"].map((status) => (
                    <button key={status} type="button" role="tab" className={filters.status === status ? "active" : ""} aria-selected={filters.status === status}
                        onClick={() => {
                            update({ status });
                            history.replaceState(null, "", "#/library");
                        }}>
                        {status === "Favorites" ? "♥ Favorites" : status}<span className="count">{counts[status]}</span>
                    </button>
                ))}
            </div>

            <div className="toolbar">
                <div className="search">
                    <Icon name="search" />
                    <input className="input" type="search" placeholder="Search title, author or series" aria-label="Search library"
                        value={filters.query} onChange={(e) => update({ query: e.target.value })} />
                </div>
                {select("Genre", "genre", genre, [["All", "All genres"], ...allGenres.map((g): [string, string] => [g, g])])}
                {select("Format", "format", filters.format, [["All", "All formats"], ...FORMATS.map((f): [string, string] => [f, f])])}
                {select("Sort", "sort", filters.sort, Object.entries(SORTS).map(([k, s]): [string, string] => [k, s.label]))}
                <div className="view-switch" role="group" aria-label="Library view">
                    <button type="button" aria-pressed={view === "shelf"} data-view="shelf" onClick={() => chooseView("shelf")}><Icon name="book" />Shelf</button>
                    <button type="button" aria-pressed={view === "grid"} data-view="grid" onClick={() => chooseView("grid")}><Icon name="layers" />Grid</button>
                </div>
            </div>

            <Results books={books} list={list} view={view} />
        </div>
    );
}

function Results({ books, list, view }: { books: Book[]; list: Book[]; view: ViewMode }) {
    if (!books.length) {
        return (
            <div className="card empty">
                <h3>Your To Be Read starts here</h3>
                <p>Search for a book and we'll fill in the cover, author and summary.</p>
                <button className="btn btn-primary" type="button" onClick={() => openAddBook()}><Icon name="plus" />Add a book</button>
            </div>
        );
    }
    if (!list.length) {
        return <div className="card empty"><h3>No books here yet</h3><p>Try a different filter or search.</p></div>;
    }
    return (
        <>
            <p className="result-count">{fmt.plural(list.length, "book")}</p>
            {view === "shelf" ? <Bookcase books={list} /> : <div className="book-grid">{list.map((b) => <BookTile key={b.id} book={b} />)}</div>}
        </>
    );
}

export function BookTile({ book }: { book: Book }) {
    const pct = percent(book);
    return (
        <button className="book-tile" type="button" onClick={() => (location.hash = `#/book/${book.id}`)}>
            <Cover book={book} size="md">
                {book.isFavorite ? <span className="fav-badge" aria-label="Favorite"><Icon name="heart" filled /></span> : null}
            </Cover>
            <div>
                <h3>{book.title}</h3>
                <p className="author">{book.author}</p>
                {book.series ? <p className="tile-series">{seriesLabel(book).replace(" · Book ", " #")}</p> : null}
                <div className="tile-meta"><StatusBadge status={book.status} /></div>
                {["Reading", "Paused"].includes(book.status) && book.totalPages
                    ? <div className="tile-meta"><ProgressBar value={pct} thin /><small>{pct}%</small></div>
                    : book.rating
                        ? <div className="tile-meta"><Stars rating={book.rating} /></div>
                        : null}
            </div>
        </button>
    );
}
