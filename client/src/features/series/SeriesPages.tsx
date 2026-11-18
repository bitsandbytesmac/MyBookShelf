// Series (#/series) and one series in reading order (#/series/:name), derived from the books.
// Same markup and behaviour as public/js/series.js.
import { useMemo, useState } from "react";
import type { Book } from "../../api/types";
import { Cover, CoverStack, ProgressBar, SeriesBadge, Stars, StatusBadge } from "../../components/BookBits";
import { authorHref, fmt } from "../../components/format";
import { Icon } from "../../components/Icon";
import { percent } from "../../domain/readingRules";
import { findSeries, seriesList, type SeriesSummary } from "../../domain/shelf";
import { useStore } from "../../store/useStore";

const FILTERS = ["All", "In progress", "Not started", "Completed"];
// Kept while you visit a series and come back.
let rememberedFilter = "All";

const openBook = (id: string) => (location.hash = `#/book/${id}`);
const bookNo = (book: Book) => (book.seriesNumber ? `#${book.seriesNumber}` : "—");

// ---------- All series ----------

export function SeriesIndexPage() {
    const books = useStore((s) => s.books);
    const all = useMemo(() => seriesList(books).sort((a, b) => a.name.localeCompare(b.name)), [books]);
    const [filter, setFilter] = useState(rememberedFilter);
    const completed = all.filter((s) => s.status === "Completed").length;
    const list = filter === "All" ? all : all.filter((s) => s.status === filter);

    return (
        <div>
            <div className="page-head">
                <div>
                    <h1>Series</h1>
                    <p>{all.length ? `${fmt.num(all.length)} series · ${completed} completed` : "Track every series you're working through"}</p>
                </div>
            </div>
            {all.length
                ? <>
                    <div className="status-tabs" role="tablist" aria-label="Series status">
                        {FILTERS.map((f) => (
                            <button key={f} type="button" role="tab" className={filter === f ? "active" : ""} aria-selected={filter === f}
                                onClick={() => setFilter((rememberedFilter = f))}>
                                {f}<span className="count">{f === "All" ? all.length : all.filter((s) => s.status === f).length}</span>
                            </button>
                        ))}
                    </div>
                    {list.length
                        ? <div className="series-grid">{list.map((s) => <SeriesCard key={s.key} series={s} />)}</div>
                        : <div className="card empty"><h3>Nothing {filter.toLowerCase()}</h3><p>Try another filter.</p></div>}
                </>
                : (
                    <div className="card empty">
                        <h3>No series yet</h3>
                        <p>Open a book, choose Edit details and fill in Series and Book #. Books in the same series are grouped here in order, with your progress.</p>
                        <a className="btn btn-primary" href="#/library">Go to library</a>
                    </div>
                )}
        </div>
    );
}

function SeriesCard({ series }: { series: SeriesSummary }) {
    return (
        <a className="card series-card" href={`#/series/${encodeURIComponent(series.name)}`}>
            <CoverStack books={series.books} max={5} />
            <div className="series-card-body">
                <div className="series-card-title">
                    <h3>{series.name}</h3>
                    <SeriesBadge status={series.status} />
                </div>
                <p className="sub">{series.authors.join(", ")}</p>
                <div className="series-progress">
                    <ProgressBar value={series.percent} thin />
                    <small>{series.read}/{series.outOf} read · {series.percent}%</small>
                </div>
                {series.next && series.status !== "Completed"
                    ? <p className="series-next"><span>Next up: </span>{`${bookNo(series.next)} ${series.next.title}`}</p>
                    : null}
            </div>
        </a>
    );
}

// ---------- One series ----------

export function SeriesPage({ name }: { name: string }) {
    const books = useStore((s) => s.books);
    const series = useMemo(() => findSeries(books, name), [books, name]);
    const back = <a className="back-link" href="#/series"><Icon name="back" />Series</a>;

    if (!series) {
        return (
            <div>
                {back}
                <div className="card empty">
                    <h3>Series not found</h3>
                    <p>No books on your shelf belong to this series anymore.</p>
                    <a className="btn" href="#/series">All series</a>
                </div>
            </div>
        );
    }

    const remaining = series.outOf - series.read;
    const { missing, next } = series;

    return (
        <div>
            {back}
            <section className="series-hero card card-pad">
                <div className="series-hero-top">
                    <div>
                        <h1>{series.name}</h1>
                        <p className="by">by {series.authors.map((a, i) => <span key={a}>{i ? ", " : null}<a href={authorHref(a)}>{a}</a></span>)}</p>
                    </div>
                    <SeriesBadge status={series.status} />
                </div>
                <div className="series-hero-progress">
                    <div className="series-big-row">
                        <div className="series-big"><strong>{series.read}/{series.outOf}</strong><span>{` ${series.outOf === 1 ? "book" : "books"} read`}</span></div>
                        <span className="series-pct">{series.percent}%</span>
                    </div>
                    <ProgressBar value={series.percent} />
                    <p className="sub">{series.status === "Completed"
                        ? (series.total ? "You've finished the whole series. 🎉" : "You've finished every book you've added from this series. 🎉")
                        : `${fmt.plural(remaining, "book")} to go` + (missing ? ` · ${fmt.plural(missing, "book")} not on your shelf yet` : "")}</p>
                    {series.total ? null : <p className="hint">Tip: set “Books in series” in a book's Edit details to track the whole series, e.g. 1 of 6.</p>}
                </div>
                {next && series.status !== "Completed"
                    ? (
                        <button className="series-upnext" type="button" onClick={() => openBook(next.id)}>
                            <Cover book={next} size="xs" />
                            <span>
                                <small>{next.status === "To Be Read" ? "Up next" : "Continue reading"}</small>
                                <strong>{`${bookNo(next)} · ${next.title}`}</strong>
                            </span>
                            <Icon name="arrow" />
                        </button>
                    )
                    : null}
            </section>
            <section className="section">
                <div className="section-head"><h2>Reading order</h2></div>
                <ol className="series-list">{series.books.map((book) => <SeriesRow key={book.id} book={book} isNext={book === next} />)}</ol>
            </section>
        </div>
    );
}

function SeriesRow({ book, isNext }: { book: Book; isNext: boolean }) {
    const pct = percent(book);
    const showProgress = ["Reading", "Paused"].includes(book.status) && book.totalPages > 0;
    return (
        <li>
            <button className={`card series-row${isNext ? " is-next" : ""}${book.status === "Read" ? " is-read" : ""}`} type="button" onClick={() => openBook(book.id)}>
                <span className="series-no">{bookNo(book)}</span>
                <Cover book={book} size="sm" />
                <span className="series-row-body">
                    <strong>{book.title}</strong>
                    <span className="sub">{book.author}</span>
                    <span className="series-row-meta">
                        <StatusBadge status={book.status} />
                        {showProgress ? <span className="series-row-pct"><ProgressBar value={pct} thin />{`${pct}%`}</span> : null}
                        {book.status === "Read" && book.rating ? <Stars rating={book.rating} /> : null}
                        {isNext ? <span className="badge tag">Next up</span> : null}
                    </span>
                </span>
                <Icon name="arrow" className="series-row-arrow" />
            </button>
        </li>
    );
}
