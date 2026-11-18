// Statistics (#/statistics): a summary row, books read per month, genres, average completion and the
// Reading Recap calendar. Same markup and behaviour as public/js/statistics.js.
import { useMemo, type ReactNode } from "react";
import { Stars } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { tooltipProps } from "../../components/Tooltip";
import { readingStreak } from "../../domain/goals";
import { booksFinished, percent } from "../../domain/readingRules";
import { useStore } from "../../store/useStore";
import { RecapCard } from "./RecapCard";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function StatisticsPage() {
    const hasBooks = useStore((s) => s.books.length > 0);
    return (
        <div>
            <div className="page-head">
                <div>
                    <h1>Statistics</h1>
                    <p>{hasBooks ? "Your reading, in numbers." : "Add and finish some books to see your stats."}</p>
                </div>
            </div>
            <div className="stat-summary"><SummaryTiles /></div>
            <div className="dash-grid stats-grid section">
                <MonthlyCard />
                <GenresCard />
                <CompletionCard />
            </div>
            <div className="section"><RecapCard /></div>
        </div>
    );
}

function SummaryTiles() {
    const books = useStore((s) => s.books);
    const statistics = useStore((s) => s.statistics);
    const year = new Date().getFullYear();
    const rated = books.filter((b) => b.status === "Read" && b.rating);
    const avg = rated.length ? rated.reduce((sum, b) => sum + (b.rating || 0), 0) / rated.length : 0;
    const streak = readingStreak(statistics?.readingDays || []);

    const tile = (label: string, value: string, sub: string, extra: ReactNode = null) => (
        <div key={label} className="card dash-card dash-stat stat-tile">
            <span className="dash-stat-label">{label}</span>
            <span className="dash-stat-value">{value}</span>
            {extra}
            <span className="dash-stat-sub">{sub}</span>
        </div>
    );

    return <>
        {tile("Finished this year", fmt.num(booksFinished(books, { year }).length), `${fmt.plural(booksFinished(books).length, "book")} all time`)}
        {tile("Pages this month", fmt.num(statistics?.pagesThisMonth), `${fmt.num(statistics?.pagesThisWeek)} this week`)}
        {tile("Average rating", avg ? avg.toFixed(1) : "—", rated.length ? `from ${fmt.plural(rated.length, "rated book")}` : "rate a finished book",
            avg ? <Stars rating={Math.round(avg)} /> : null)}
        {tile("Reading streak", fmt.num(streak), streak === 1 ? "day in a row" : "days in a row")}
    </>;
}

function MonthlyCard() {
    const books = useStore((s) => s.books);
    const now = new Date();
    const year = now.getFullYear();
    const thisMonth = now.getMonth();
    const counts = useMemo(() => MONTHS.map((_, i) => booksFinished(books, { year, month: i + 1 }).length), [books, year]);
    const max = Math.max(1, ...counts);
    const total = counts.reduce((a, b) => a + b, 0);

    return (
        <section className="card card-pad">
            <h3>Books read</h3>
            <p className="sub">{`${fmt.plural(counts[thisMonth], "book")} this month · ${fmt.plural(total, "book")} in ${year}`}</p>
            <div className="months" role="list" aria-label={`Books read per month in ${year}`}>
                {counts.map((count, i) => (
                    <div key={MONTHS[i]} className={`month${i === thisMonth ? " current" : ""}`} role="listitem" aria-label={`${MONTHS[i]}: ${count}`}
                        {...tooltipProps(`${MONTHS[i]} ${year}: ${fmt.plural(count, "book")}`)}>
                        <span className="month-val">{count || ""}</span>
                        <div className="month-bar" style={{ height: `${(count / max) * 100}%` }} />
                        <span className="month-label">{MONTHS[i].charAt(0)}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function GenresCard() {
    const books = useStore((s) => s.books);
    const { read, top, max } = useMemo(() => {
        const finished = books.filter((b) => b.status === "Read");
        const source = finished.length ? finished : books;
        const counts: Record<string, number> = {};
        for (const book of source) for (const g of book.genres) counts[g] = (counts[g] || 0) + 1;
        const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        const shown = rows.slice(0, 7);
        const rest = rows.slice(7).reduce((s, [, c]) => s + c, 0);
        if (rest) shown.push(["Other", rest]);
        return { read: finished, top: shown, max: Math.max(1, ...shown.map(([, c]) => c)) };
    }, [books]);

    return (
        <section className="card card-pad">
            <h3>Genres you've read</h3>
            <p className="sub">{read.length ? `From ${fmt.plural(read.length, "finished book")}` : "No finished books yet — showing your whole shelf"}</p>
            {top.length
                ? (
                    <div className="vbars" role="list" style={{ gridTemplateColumns: `repeat(${top.length}, minmax(0, 1fr))` }}>
                        {top.map(([label, value]) => (
                            <div key={label} className="vbar" role="listitem" aria-label={`${label}: ${fmt.plural(value, "book")}`}
                                {...tooltipProps(`${label}: ${fmt.plural(value, "book")}`)}>
                                <span className="vbar-value">{value}</span>
                                <div className="vbar-track"><div className="vbar-fill" style={{ height: `${(value / max) * 100}%` }} /></div>
                                <span className="vbar-label" aria-hidden="true">{label}</span>
                            </div>
                        ))}
                    </div>
                )
                : <p className="empty-sm">Add genres to your books to see them here.</p>}
        </section>
    );
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function CompletionCard() {
    const books = useStore((s) => s.books);
    const statistics = useStore((s) => s.statistics);
    const started = books.filter((b) => b.status !== "To Be Read" && b.totalPages > 0);
    const avg = started.length ? Math.round(started.reduce((s, b) => s + percent(b), 0) / started.length) : 0;
    const count = (status: string) => books.filter((b) => b.status === status).length;

    return (
        <section className="card card-pad">
            <h3>Average completion</h3>
            <p className="sub">{started.length ? `Across ${fmt.plural(started.length, "book")} you've started` : "Start a book to see this"}</p>
            <div className="completion">
                <div className="ring" role="img" aria-label={`Average completion ${avg}%`}>
                    <svg viewBox="0 0 120 120" aria-hidden="true">
                        <circle cx="60" cy="60" r={RADIUS} fill="none" style={{ stroke: "var(--sage-soft)" }} strokeWidth="12" />
                        <circle cx="60" cy="60" r={RADIUS} fill="none" style={{ stroke: "var(--sage)" }} strokeWidth="12" strokeLinecap="round"
                            strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE * (1 - avg / 100)} />
                    </svg>
                    <span className="ring-value">{avg}%</span>
                </div>
                <div className="mini-stats">
                    <span><strong>{fmt.num(statistics?.pagesThisWeek)}</strong>pages this week</span>
                    <span><strong>{fmt.num(statistics?.pagesThisMonth)}</strong>pages this month</span>
                    <span><strong>{count("Paused")}</strong>paused · <strong>{count("DNF")}</strong>DNF</span>
                </div>
            </div>
        </section>
    );
}
