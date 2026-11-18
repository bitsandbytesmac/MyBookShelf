// Single book page (#/book/:id): details, journal entries, notes, review and challenge spots.
// Same markup and behaviour as public/js/bookPage.js.
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { Book } from "../../api/types";
import { Chilis, Cover, ProgressBar, Stars, StatusBadge } from "../../components/BookBits";
import { authorHref, fmt, seriesHref, seriesLabel } from "../../components/format";
import { Icon } from "../../components/Icon";
import { confirmDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { inWindow, spotsForBook, type SpotForBook } from "../../domain/challengeMatch";
import { STATUSES } from "../../domain/constants";
import { today } from "../../domain/dates";
import { percent } from "../../domain/readingRules";
import { authorNames } from "../../domain/shelf";
import { assignSpots, deleteBook, updateBook } from "../../store/store";
import { useStore } from "../../store/useStore";
import { openLogReading, openSpot } from "../../app/actions";
import { openEditBook } from "../books/EditBookDialog";
import { openReview } from "../books/ReviewDialog";
import { ReasonChips, challengeHref } from "../challenges/chips";

// Runs a change and reports how it went in a toast.
async function run(action: () => Promise<unknown>, message?: string) {
    try {
        await action();
        if (message) toast(message);
    } catch (error) {
        toast((error as Error).message, { error: true });
    }
}

export function BookPage({ id }: { id: string | undefined }) {
    const book = useStore((s) => s.books.find((b) => b.id === String(id)));

    if (!book) {
        return (
            <div className="card empty">
                <h3>Book not found</h3>
                <p>It may have been deleted.</p>
                <a className="btn" href="#/library">Back to library</a>
            </div>
        );
    }

    return (
        <div>
            <a className="back-link" href="#/library"><Icon name="back" />Library</a>
            <Hero book={book} />
            <div className="book-cols">
                <div><ProgressCard book={book} /><ReviewCard book={book} /><ChallengeSpotsCard book={book} /></div>
                <div><DetailsCard book={book} /><NotesCard key={book.id} book={book} /></div>
            </div>
        </div>
    );
}

// ---------- Hero ----------

function Hero({ book }: { book: Book }) {
    const [expanded, setExpanded] = useState(false);
    const long = book.summary.length > 420;

    const remove = async () => {
        const ok = await confirmDialog({ title: "Delete this book?", text: `"${book.title}" and its review will be removed. This can't be undone.` });
        if (!ok) return;
        await run(async () => {
            await deleteBook(book.id);
            location.hash = "#/library";
        }, "Book deleted");
    };

    return (
        <section className="book-hero">
            <Cover book={book} size="lg" />
            <div style={{ minWidth: 0, width: "100%" }}>
                <h1>{book.title}</h1>
                <p className="by">by {authorNames(book).map((name, i) => <span key={name}>{i ? ", " : null}<a href={authorHref(name)}>{name}</a></span>)}</p>
                {book.series ? <a className="series-link" href={seriesHref(book.series)}><Icon name="layers" />{seriesLabel(book)}</a> : null}
                <div className="badge-row">
                    <StatusBadge status={book.status} />
                    {book.format ? <span className="badge meta">{book.format}</span> : null}
                    {book.ownership ? <span className="badge meta">{book.ownership}</span> : null}
                    {book.isPhysical ? <a className="badge meta" href="#/physical">Physical book</a> : null}
                    {book.ageCategory ? <span className="badge meta">{book.ageCategory}</span> : null}
                    {book.genres.map((g) => <span key={`g-${g}`} className="badge tag">{g}</span>)}
                    {book.subgenres.map((g) => <span key={`s-${g}`} className="badge tag-sub">{g}</span>)}
                </div>
                {book.tropes.length
                    ? <div className="badge-row trope-row" aria-label="Tropes">{book.tropes.map((t) => <span key={t} className="badge trope">{t}</span>)}</div>
                    : null}
                {book.summary
                    ? <p className={`summary-text${long && !expanded ? " clamped" : ""}`}>{book.summary}</p>
                    : <p className="summary-text muted">No summary yet. <button className="link-btn" type="button" onClick={() => openEditBook(book)}>Add one</button></p>}
                {long
                    ? <button className="link-btn" type="button" style={{ marginTop: "6px" }} onClick={() => setExpanded((e) => !e)}>{expanded ? "Show less" : "Read more"}</button>
                    : null}
                <div className="hero-actions">
                    <button className="btn btn-primary" type="button" onClick={() => openReview(book)}><Icon name="pen" />{book.rating || book.review ? "Edit review" : "Write review"}</button>
                    <button className="btn" type="button" onClick={() => openEditBook(book)}><Icon name="edit" />Edit details</button>
                    <select className="select" aria-label="Book status" style={{ width: "auto", height: "38px", borderRadius: "999px" }} value={book.status}
                        onChange={(e) => {
                            const status = e.target.value as Book["status"];
                            run(() => updateBook(book.id, { status }), `Moved to ${status}`);
                        }}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button className={`icon-btn${book.isFavorite ? " fav-on" : ""}`} type="button" title="Favorite"
                        aria-label={book.isFavorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={book.isFavorite}
                        onClick={() => run(() => updateBook(book.id, { isFavorite: !book.isFavorite }), book.isFavorite ? "Removed from favorites" : "Added to favorites")}>
                        <Icon name="heart" filled={book.isFavorite} />
                    </button>
                    <button className="icon-btn" type="button" aria-label="Delete book" title="Delete" onClick={remove}><Icon name="trash" /></button>
                </div>
            </div>
        </section>
    );
}

// ---------- Reading progress ----------

function ProgressCard({ book }: { book: Book }) {
    const pct = percent(book);
    const activities = useStore((s) => s.activities);
    // This book's latest journal entries: date, pages read and the note.
    const sessions = useMemo(() => activities.filter((a) => String(a.book_id) === book.id).slice(0, 6), [activities, book.id]);

    return (
        <section className="card card-pad">
            <h3>Reading progress</h3>
            {!book.totalPages
                ? <>
                    <p className="sub">Add the total number of pages to track your progress.</p>
                    <button className="btn btn-sm" type="button" style={{ marginTop: "14px" }} onClick={() => openEditBook(book)}>Add page count</button>
                </>
                : <>
                    <div className="session-progress">
                        <span className="pct">{pct}%</span>
                        <span className="pages">Page {fmt.num(book.currentPage)} of {fmt.num(book.totalPages)}</span>
                    </div>
                    <ProgressBar value={pct} />
                </>}
            {book.status !== "Read"
                // Same "Log your reading" window as the dashboard and the top bar.
                ? <button className="btn btn-sage session-log" type="button" onClick={() => openLogReading(book.id)}><Icon name="pen" />Log your reading</button>
                : book.dateFinished ? <p className="sub" style={{ marginTop: "12px" }}>Finished {fmt.date(book.dateFinished)}</p> : null}
            {!sessions.length
                ? <p className="hint session-empty">No journal entries yet.</p>
                : (
                    <ul className="sessions" aria-label="Journal entries">
                        {sessions.map((a) => (
                            <li key={a.id}>
                                <span className="session-line">
                                    <span>{fmt.date(a.session_date || a.created_at)}{a.pages_read > 0 ? ` · p. ${a.previous_page} → ${a.current_page}` : ""}</span>
                                    <strong>{a.pages_read > 0 ? `+${a.pages_read}` : "Note"}</strong>
                                </span>
                                {a.note ? <span className="session-note">{a.note}</span> : null}
                            </li>
                        ))}
                    </ul>
                )}
        </section>
    );
}

// ---------- Review ----------

function ReviewCard({ book }: { book: Book }) {
    const hasReview = book.rating || book.spice || book.review || book.quotes.length || book.dateStarted || book.dateFinished;

    // Ticking a box saves straight away.
    const toggle = (field: "reviewed" | "journaled", label: string, hint: string) => (
        <label className="check">
            <input type="checkbox" checked={book[field]}
                onChange={(e) => {
                    const checked = e.target.checked;
                    run(() => updateBook(book.id, { [field]: checked }), checked ? `${label} ticked off` : `${label} unticked`);
                }} />
            <span>{label}<small>{hint}</small></span>
        </label>
    );

    return (
        <section className="card card-pad">
            <div className="review-head">
                <h3>My review</h3>
                <button className="btn btn-sm btn-primary" type="button" onClick={() => openReview(book)}>{hasReview ? "Edit" : "Review"}</button>
            </div>
            <div className="check-row review-checks">
                {toggle("reviewed", "Review", "Written or posted")}
                {toggle("journaled", "Reading journal", "Added to my journal")}
            </div>
            {!hasReview
                ? <p className="sub" style={{ marginTop: "8px" }}>Rate it, add a spice level, save favourite quotes and write your thoughts.</p>
                : <>
                    <div className="review-scores">
                        <div><span className="label">Rating</span>{book.rating ? <Stars rating={book.rating} /> : <span className="muted">—</span>}</div>
                        <div><span className="label">Spice</span>{book.spice ? <Chilis spice={book.spice} /> : <span className="muted">—</span>}</div>
                        <div><span className="label">Started</span><span>{book.dateStarted ? fmt.date(book.dateStarted) : "—"}</span></div>
                        <div><span className="label">Finished</span><span>{book.dateFinished ? fmt.date(book.dateFinished) : "—"}</span></div>
                    </div>
                    {book.review ? <p className="review-text">{book.review}</p> : null}
                    {book.quotes.length ? <div className="review-quotes">{book.quotes.map((q, i) => <blockquote key={i}>{q}</blockquote>)}</div> : null}
                </>}
        </section>
    );
}

// ---------- Details ----------

function DetailsCard({ book }: { book: Book }) {
    const rows: [string, ReactNode][] = [
        ["Book status", book.status],
        ["Series", book.series ? <a href={seriesHref(book.series)}>{seriesLabel(book)}</a> : ""],
        ["Format", book.format],
        ["Status", book.ownership],
        ["Age category", book.ageCategory],
        ["Pages", book.totalPages ? fmt.num(book.totalPages) : ""],
        ["Genres", book.genres.join(", ")],
        ["Sub-genres", book.subgenres.join(", ")],
        ["Tropes", book.tropes.join(", ")],
        ["Themes & keywords", book.themes.join(", ")],
        ["Setting", book.settings.join(", ")],
        ["Characters", book.characters.join(", ")],
        ["Published", book.publishedYear ?? ""],
        ["Content warnings", book.contentWarnings.length
            ? <details className="cw-reveal"><summary>Show {fmt.plural(book.contentWarnings.length, "warning")}</summary><span>{book.contentWarnings.join(", ")}</span></details>
            : ""],
        ["Added", book.createdAt ? fmt.date(String(book.createdAt).slice(0, 10)) : ""]
    ];
    return (
        <section className="card card-pad">
            <div className="review-head">
                <h3>Details</h3>
                <button className="link-btn" type="button" onClick={() => openEditBook(book)}>Edit</button>
            </div>
            <dl className="detail-list">
                {rows.map(([label, value]) => [<dt key={`t-${label}`}>{label}</dt>, <dd key={`d-${label}`}>{value || "—"}</dd>])}
            </dl>
        </section>
    );
}

// ---------- Challenge spots ----------

// The spots this book fills, the open spots it fits (confirmed), and possible ones (from its summary only).
function ChallengeSpotsCard({ book }: { book: Book }) {
    const challenges = useStore((s) => s.challenges);
    const books = useStore((s) => s.books);
    const entries = useMemo(() => spotsForBook(book, challenges, books, today()), [book, challenges, books]);
    const filled = entries.filter((e) => e.filledByThis);
    const confirmed = entries.filter((e) => !e.filledByThis && e.match.status === "confirmed");
    const possible = entries.filter((e) => !e.filledByThis && e.match.status === "possible");

    const add = (e: SpotForBook) => () => run(
        () => assignSpots(e.challenge.id, { [e.index]: book.id }),
        book.status === "Read" ? `Counts for “${e.item.label}” 🎉` : `Planned for “${e.item.label}”. It counts once you finish the book.`
    );

    const row = (e: SpotForBook, action: ReactNode) => (
        <li key={`${e.challenge.id}-${e.index}`} className="spot-row">
            <div className="spot-row-text">
                <a href={challengeHref(e.challenge.id)}>{e.challenge.name}</a>
                <strong>{e.item.label}</strong>
                {e.match.reasons.length ? <ReasonChips match={e.match} /> : null}
            </div>
            {action}
        </li>
    );

    return (
        <section className="card card-pad challenge-spots" aria-labelledby="bookSpotsTitle">
            <div className="review-head"><h3 id="bookSpotsTitle">Challenge spots</h3><a className="link-btn" href="#/challenges">All challenges</a></div>
            {!entries.length
                ? <p className="sub" style={{ marginTop: "8px" }}>{challenges.length
                    ? "No open challenge spot fits this book yet. Add themes, setting or characters in Edit details to find more matches."
                    : "Start a challenge and books like this one fill its spots."}</p>
                : null}
            {filled.length
                ? <>
                    <p className="label spot-group">In your challenges</p>
                    <ul className="spot-rows">{filled.map((e) => row(e, book.status === "Read"
                        ? <span className="match-badge is-confirmed"><Icon name="check" />Counts</span>
                        : <button type="button" className="btn btn-sm btn-ghost" onClick={() => openSpot(e.challenge.id, e.index)}>Planned</button>))}</ul>
                </>
                : null}
            {confirmed.length
                ? <>
                    <p className="label spot-group">{book.status === "Read" ? "Can count for" : "Can fill once finished"}</p>
                    <ul className="spot-rows">{confirmed.map((e) => row(e, book.status === "Read" && !inWindow(book, e.challenge)
                        ? <span className="hint">Finished outside the dates</span>
                        : <button type="button" className="btn btn-sm btn-primary" onClick={add(e)}>{book.status === "Read" ? "Count it" : "Plan it"}</button>))}</ul>
                </>
                : null}
            {possible.length
                ? <>
                    <p className="label spot-group">Possible matches</p>
                    <p className="hint">Only the summary suggests these, so check before adding.</p>
                    <ul className="spot-rows">{possible.map((e) => row(e, <button type="button" className="btn btn-sm btn-ghost" onClick={add(e)}>Add anyway</button>))}</ul>
                </>
                : null}
        </section>
    );
}

// ---------- Notes ----------

// Unsaved notes survive leaving the page and coming back (per book, until saved).
const noteDrafts = new Map<string, string>();

function NotesCard({ book }: { book: Book }) {
    const [text, setText] = useState(() => noteDrafts.get(book.id) ?? book.notes);
    const [saving, setSaving] = useState(false);

    async function save(event: FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            await updateBook(book.id, { notes: text.trim() });
            noteDrafts.delete(book.id);
            setText(text.trim());
            toast("Notes saved");
        } catch (error) {
            toast((error as Error).message, { error: true });
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="card card-pad">
            <form className="notes-form" onSubmit={save}>
                <h3>Notes</h3>
                <textarea className="textarea" rows={5} placeholder="Thoughts while reading, theories, reminders…" aria-label="Notes" value={text}
                    onChange={(e) => {
                        setText(e.target.value);
                        noteDrafts.set(book.id, e.target.value);
                    }} />
                <div className="row">
                    <span className="saved-hint" />
                    <button className="btn btn-sm" type="submit" disabled={saving || text === book.notes}>Save notes</button>
                </div>
            </form>
        </section>
    );
}
