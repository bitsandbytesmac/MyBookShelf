// Authors (#/authors) and one author's page (#/author/:name), derived from the books.
// Same markup and behaviour as public/js/authors.js.
import { useMemo, useState } from "react";
import { AuthorAvatar, CoverStack, ProgressBar, SeriesBadge } from "../../components/BookBits";
import { authorHref, fmt, seriesHref } from "../../components/format";
import { Icon } from "../../components/Icon";
import { authorNames, authorsList, bySeriesOrder, findAuthor, nameKey, seriesList, type Group } from "../../domain/shelf";
import { useStore } from "../../store/useStore";
import { BookTile } from "../library/LibraryPage";

const newest = (author: Group) => Math.max(...author.books.map((b) => Number(b.id) || 0));

const SORTS: Record<string, { label: string; fn: (a: Group, b: Group) => number }> = {
    books: { label: "Most books", fn: (a, b) => b.books.length - a.books.length || a.name.localeCompare(b.name) },
    name: { label: "Name A–Z", fn: (a, b) => a.name.localeCompare(b.name) },
    recent: { label: "Recently added", fn: (a, b) => newest(b) - newest(a) }
};

// Kept while you visit an author and come back.
let remembered = { query: "", sort: "books" };

export function AuthorsPage() {
    const books = useStore((s) => s.books);
    const authors = useMemo(() => authorsList(books), [books]);
    const [view, setView] = useState(remembered);
    const update = (change: Partial<typeof view>) => setView((v) => (remembered = { ...v, ...change }));

    const list = useMemo(() => {
        const q = view.query.trim().toLowerCase();
        return authors.filter((a) => !q || a.name.toLowerCase().includes(q)).sort(SORTS[view.sort].fn);
    }, [authors, view]);

    return (
        <div>
            <div className="page-head">
                <div>
                    <h1>Authors</h1>
                    <p>{authors.length ? `${fmt.plural(authors.length, "author")} on your shelf` : "Authors appear here as you add books"}</p>
                </div>
            </div>
            {authors.length
                ? (
                    <div className="toolbar">
                        <div className="search">
                            <Icon name="search" />
                            <input className="input" type="search" placeholder="Search authors" aria-label="Search authors"
                                value={view.query} onChange={(e) => update({ query: e.target.value })} />
                        </div>
                        <select className="select" aria-label="Sort authors" value={view.sort} onChange={(e) => update({ sort: e.target.value })}>
                            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                        </select>
                    </div>
                )
                : null}
            {!authors.length
                ? (
                    <div className="card empty">
                        <h3>No authors yet</h3>
                        <p>Every book you add puts its author here, with all their books together.</p>
                        <a className="btn btn-primary" href="#/library">Go to library</a>
                    </div>
                )
                : !list.length
                    ? <div className="card empty"><h3>No matching authors</h3><p>Try a different name.</p></div>
                    : <div className="author-grid">{list.map((a) => <AuthorCard key={a.key} author={a} />)}</div>}
        </div>
    );
}

function AuthorCard({ author }: { author: Group }) {
    const read = author.books.filter((b) => b.status === "Read").length;
    return (
        <a className="card author-card" href={authorHref(author.name)}>
            <AuthorAvatar name={author.name} />
            <div className="author-card-body">
                <h3>{author.name}</h3>
                <p className="sub">{fmt.plural(author.books.length, "book")} · {read} read</p>
            </div>
            <CoverStack books={author.books} max={3} />
        </a>
    );
}

export function AuthorPage({ name }: { name: string }) {
    const books = useStore((s) => s.books);
    const author = useMemo(() => findAuthor(books, name), [books, name]);
    const series = useMemo(() => (author
        ? seriesList(books).filter((s) => s.books.some((b) => authorNames(b).some((n) => nameKey(n) === author.key)))
        : []), [books, author]);

    const back = <a className="back-link" href="#/authors"><Icon name="back" />Authors</a>;

    if (!author) {
        return (
            <div>
                {back}
                <div className="card empty">
                    <h3>Author not found</h3>
                    <p>There are no books by this author on your shelf anymore.</p>
                    <a className="btn" href="#/authors">All authors</a>
                </div>
            </div>
        );
    }

    const list = author.books;
    const read = list.filter((b) => b.status === "Read");
    const rated = list.filter((b) => b.rating);
    const avg = rated.length ? (rated.reduce((s, b) => s + (b.rating || 0), 0) / rated.length).toFixed(1) : null;
    const pages = read.reduce((s, b) => s + (b.totalPages || 0), 0);

    // Books grouped: series books in reading order first, then standalones by title.
    const ordered = [...list].sort((a, b) => {
        if (!!a.series !== !!b.series) return a.series ? -1 : 1;
        if (a.series && b.series && a.series !== b.series) return a.series.localeCompare(b.series);
        return a.series ? bySeriesOrder(a, b) : a.title.localeCompare(b.title);
    });

    const stat = (value: string, label: string) => <div className="author-stat"><strong>{value}</strong><span>{label}</span></div>;

    return (
        <div>
            {back}
            <section className="author-hero">
                <AuthorAvatar name={author.name} size="lg" />
                <div>
                    <h1>{author.name}</h1>
                    <div className="author-stats">
                        {stat(fmt.num(list.length), list.length === 1 ? "book" : "books")}
                        {stat(fmt.num(read.length), "read")}
                        {stat(avg ? `★ ${avg}` : "—", "avg rating")}
                        {stat(fmt.num(pages), "pages read")}
                    </div>
                </div>
            </section>
            {series.length
                ? (
                    <section className="section">
                        <div className="section-head"><h2>Series</h2></div>
                        <div className="series-chips">
                            {series.map((s) => (
                                <a key={s.key} className="card series-chip" href={seriesHref(s.name)}>
                                    <div>
                                        <strong>{s.name}</strong>
                                        <span className="sub">{s.read} of {fmt.plural(s.outOf, "book")} read</span>
                                    </div>
                                    <SeriesBadge status={s.status} />
                                    <ProgressBar value={s.percent} thin />
                                </a>
                            ))}
                        </div>
                    </section>
                )
                : null}
            <section className="section">
                <div className="section-head"><h2>Books</h2></div>
                <div className="book-grid">{ordered.map((b) => <BookTile key={b.id} book={b} />)}</div>
            </section>
        </div>
    );
}
