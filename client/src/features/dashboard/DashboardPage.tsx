// Dashboard (#/dashboard), designed from the owner's sketch: Currently Reading / TBR / Completed,
// reading streak + month calendar, reading goals, quote of the day, Next Up and the most recent
// journal entries. Same markup and behaviour as public/js/dashboard.js.
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { Book } from "../../api/types";
import { Cover, CoverStack, ProgressBar } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { Icon } from "../../components/Icon";
import { Modal, confirmDialog, openDialog } from "../../components/Modal";
import { toast } from "../../components/Toast";
import { NEXT_UP_MAX } from "../../domain/constants";
import { today } from "../../domain/dates";
import { goalProgress, goalTitle, readingStreak } from "../../domain/goals";
import { quoteOfTheDay } from "../../domain/quote";
import { booksFinished, percent } from "../../domain/readingRules";
import { deleteCustomGoal, getState, nextUpBooks, saveGoals, saveNextUp } from "../../store/store";
import { useStore } from "../../store/useStore";
import { openAddBook } from "../books/AddBookDialogs";
import { currentUser } from "../auth/currentUser";
import { openCustomize } from "../theme/CustomizeDialog";
import { openLogReading } from "../journal/LogReading";
import { openGoalDialog } from "./GoalDialog";
import type { CustomGoal } from "../../api/types";

const bookHref = (id: string) => `#/book/${id}`;

function greeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

// "29 October" (adds the year when it isn't this year).
function dayLabel(value: string): string {
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}) });
}

// Runs a change and reports a failure in a toast.
async function attempt(action: () => Promise<unknown>, message?: string) {
    try {
        await action();
        if (message) toast(message);
    } catch (error) {
        toast((error as Error).message, { error: true });
    }
}

export function DashboardPage() {
    const books = useStore((s) => s.books);
    const [user] = useState(currentUser);

    const head = (
        <div className="page-head">
            <div>
                <h1>{`${greeting()}${user.username ? `, ${user.username}` : ""}`}</h1>
                <p>{books.length ? "Here's your reading life at a glance." : "Your shelf is waiting for its first book."}</p>
            </div>
            <div className="head-actions">
                <button className="btn btn-ghost customize-btn" type="button" onClick={openCustomize} aria-label="Customize colours">
                    <Icon name="palette" /><span className="label">Customize</span>
                </button>
                {books.length
                    ? <button className="btn btn-primary mobile-only" type="button" onClick={() => openLogReading()}><Icon name="pen" />Log your reading</button>
                    : null}
            </div>
        </div>
    );

    if (!books.length) {
        return (
            <div>
                {head}
                <div className="card empty">
                    <h3>Start your shelf</h3>
                    <p>Search for a book and its cover, author and summary fill in automatically.</p>
                    <button className="btn btn-primary" type="button" onClick={() => openAddBook()}><Icon name="plus" />Add your first book</button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {head}
            <div className="dash-board">
                <CurrentlyReadingCard />
                <StatCards />
                <StreakCard />
                <GoalsCard />
                <QuoteCard />
                <NextUpCard />
                <RecentEntriesCard />
            </div>
        </div>
    );
}

// ---------- Currently Reading ----------

function CurrentlyReadingCard() {
    const books = useStore((s) => s.books);
    const activities = useStore((s) => s.activities);
    // Most recently logged first, then most recently added.
    const reading = useMemo(() => {
        const lastLogged = (book: Book) => activities.find((a) => String(a.book_id) === book.id)?.created_at || "";
        return books.filter((b) => b.status === "Reading")
            .sort((a, b) => String(lastLogged(b)).localeCompare(String(lastLogged(a))) || Number(b.id) - Number(a.id));
    }, [books, activities]);
    const book = reading[0];

    return (
        <section className="card dash-card dash-reading" aria-labelledby="dashReadingTitle">
            <div className="dash-card-head">
                <h2 id="dashReadingTitle">Currently Reading</h2>
                {reading.length > 1 ? <a href="#/library?status=Reading">+{reading.length - 1} more</a> : null}
            </div>
            {!book
                ? <>
                    <p className="dash-empty">Nothing on the go right now.</p>
                    <button className="btn btn-sm btn-primary" type="button" onClick={() => openLogReading()}>Start a book</button>
                </>
                : (
                    <div className="cr-book">
                        <a href={bookHref(book.id)} className="cr-cover" aria-hidden="true" tabIndex={-1}><Cover book={book} size="sm" /></a>
                        <div className="cr-info">
                            <a href={bookHref(book.id)} className="cr-title">{book.title}</a>
                            <span className="cr-author">{book.author}</span>
                            {book.totalPages ? <div className="cr-progress"><ProgressBar value={percent(book)} thin /><span>{percent(book)}%</span></div> : null}
                            <span className="cr-pages">{book.totalPages ? `Page ${fmt.num(book.currentPage)} of ${fmt.num(book.totalPages)}` : "Add page count to track progress"}</span>
                            <button className="btn btn-sm cr-log" type="button" onClick={() => openLogReading(book.id)}><Icon name="pen" />Log reading</button>
                        </div>
                    </div>
                )}
        </section>
    );
}

// ---------- TBR + Completed ----------

function StatCards() {
    const state = useStore((s) => s);
    const { tbr, finished } = useMemo(() => {
        // TBR covers: Next Up picks first, then the most recently added. Completed: most recently finished first.
        const next = nextUpBooks(state);
        const rest = state.books.filter((b) => b.status === "To Be Read" && !next.includes(b)).sort((a, b) => Number(b.id) - Number(a.id));
        const done = state.books.filter((b) => b.status === "Read")
            .sort((a, b) => (b.dateFinished || "").localeCompare(a.dateFinished || "") || Number(b.id) - Number(a.id));
        return { tbr: [...next, ...rest], finished: done };
    }, [state]);

    const statCard = (cls: string, label: string, value: number, sub: string, href: string, books: Book[]) => (
        <a className={`card dash-card dash-stat ${cls}`} href={href}>
            <span className="dash-stat-label">{label}</span>
            <span className="dash-stat-value">{fmt.num(value)}</span>
            <span className="dash-stat-sub">{sub}</span>
            {books.length ? <CoverStack books={books} max={5} /> : null}
        </a>
    );

    return <>
        {statCard("dash-tbr", "TBR", tbr.length, "books in your TBR", "#/library?status=To%20Be%20Read", tbr)}
        {statCard("dash-done", "Completed", finished.length, "books finished", "#/library?status=Read", finished)}
    </>;
}

// ---------- Streak + this month's calendar ----------

function StreakCard() {
    const readingDays = useStore((s) => s.statistics?.readingDays);
    const days = useMemo(() => new Set(readingDays || []), [readingDays]);
    const streak = readingStreak(days);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const offset = (new Date(year, month, 1).getDay() + 6) % 7; // Monday first
    const key = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const monthDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    const readThisMonth = monthDays.filter((d) => days.has(key(d))).length;
    const monthName = now.toLocaleDateString(undefined, { month: "long" });

    return (
        <section className="card dash-card dash-streak" aria-labelledby="dashStreakTitle">
            <div className="dash-card-head"><h2 id="dashStreakTitle">Reading Streak</h2></div>
            <div className="streak-body">
                <div className={`streak-pill${streak ? " is-on" : ""}`}>
                    <strong>{streak}</strong>
                    <span>{streak === 1 ? "day of streak" : "days of streak"}</span>
                </div>
                <div className="streak-cal">
                    <span className="cal-month">{monthName}</span>
                    <div className="cal-grid" role="img" aria-label={`Read on ${fmt.plural(readThisMonth, "day")} in ${monthName}`}>
                        {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={`h${i}`} className="cal-head" aria-hidden="true">{w}</span>)}
                        {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} className="cal-day is-blank" />)}
                        {monthDays.map((d) => {
                            const read = days.has(key(d));
                            return <span key={d} className={`cal-day${read ? " is-read" : ""}${d === now.getDate() ? " is-today" : ""}`} title={`${monthName} ${d}${read ? ": read" : ""}`}>{d}</span>;
                        })}
                    </div>
                </div>
            </div>
            <p className="dash-foot">{!streak
                ? "Log your reading to start a streak."
                : days.has(today()) ? "You've read today. Keep it going! 🔥" : "Read today to keep your streak alive."}</p>
        </section>
    );
}

// ---------- Reading goals ----------

function GoalsCard() {
    const books = useStore((s) => s.books);
    const { monthlyGoal, yearlyGoal } = useStore((s) => s.goals);
    const customGoals = useStore((s) => s.customGoals);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ yearly: String(yearlyGoal), monthly: String(monthlyGoal) });
    const yearlyRef = useRef<HTMLInputElement>(null);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const finished = useMemo(() => booksFinished(books, { year }).sort((a, b) => b.dateFinished!.localeCompare(a.dateFinished!)), [books, year]);
    const thisMonth = useMemo(() => booksFinished(books, { year, month }).length, [books, year, month]);
    const done = finished.length;
    const left = Math.max(yearlyGoal - done, 0);
    const pct = Math.min(100, Math.round((done / yearlyGoal) * 100));
    const shown = finished.slice(0, 6);

    const openEdit = () => {
        if (!editing) setForm({ yearly: String(yearlyGoal), monthly: String(monthlyGoal) });
        setEditing((e) => !e);
        setTimeout(() => yearlyRef.current?.focus(), 0);
    };

    async function save(event: FormEvent) {
        event.preventDefault();
        const m = Number(form.monthly);
        const y = Number(form.yearly);
        if (!Number.isInteger(m) || m < 1 || m > 100) return toast("Monthly goal must be 1–100 books.", { error: true });
        if (!Number.isInteger(y) || y < 1 || y > 1000) return toast("Yearly goal must be 1–1000 books.", { error: true });
        try {
            await saveGoals({ monthlyGoal: m, yearlyGoal: y });
            setEditing(false); // the form folds away once saved
            toast("Reading goals saved");
        } catch (error) {
            toast((error as Error).message, { error: true });
        }
    }

    return (
        <section className="card dash-card dash-goals" aria-labelledby="dashGoalsTitle">
            <div className="dash-card-head">
                <h2 id="dashGoalsTitle">Your Reading Goals</h2>
                <button className="link-btn" type="button" onClick={openEdit}>Edit goals</button>
            </div>
            <div className="year-goal">
                <span className="label">Books this year</span>
                <div className="goal-number">{done}<span>{` ${done === 1 ? "book" : "books"} finished`}</span></div>
                <div className="year-goal-bar"><ProgressBar value={pct} /><span>{pct}%</span></div>
                <p className="goal-foot">{left ? `${fmt.plural(left, "book")} more to go · goal ${yearlyGoal}` : "Goal reached! 🎉"}</p>
            </div>
            {shown.length
                ? (
                    <div className="goal-covers" aria-label="Finished this year">
                        {shown.map((b) => <a key={b.id} href={bookHref(b.id)} title={b.title} aria-label={b.title}><Cover book={b} size="sm" /></a>)}
                        {finished.length > shown.length ? <a className="goal-more" href="#/library?status=Read">+{finished.length - shown.length}</a> : null}
                    </div>
                )
                : <p className="hint">Books you finish this year line up here.</p>}
            <p className="goal-month">This month: {thisMonth} / {monthlyGoal} books</p>
            {customGoals.length ? <ul className="goal-list">{customGoals.map((g) => <CustomGoalRow key={g.id} goal={g} books={books} />)}</ul> : null}
            <form className={`goal-edit${editing ? "" : " hidden"}`} onSubmit={save}>
                <div className="field">
                    <label htmlFor="gYearly">Books this year</label>
                    <input ref={yearlyRef} className="input" type="number" min={1} max={1000} id="gYearly" value={form.yearly} onChange={(e) => setForm((f) => ({ ...f, yearly: e.target.value }))} />
                </div>
                <div className="field">
                    <label htmlFor="gMonthly">Books a month</label>
                    <input className="input" type="number" min={1} max={100} id="gMonthly" value={form.monthly} onChange={(e) => setForm((f) => ({ ...f, monthly: e.target.value }))} />
                </div>
                <button className="btn btn-sm btn-primary" type="submit">Save goals</button>
                <button className="btn btn-sm btn-ghost" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </form>
            <button className="btn add-goal-btn" type="button" onClick={() => openGoalDialog()}><Icon name="plus" />Add another goal</button>
        </section>
    );
}

function CustomGoalRow({ goal, books }: { goal: CustomGoal; books: Book[] }) {
    const { done, percent: pct } = goalProgress(books, goal);
    const unit = goal.metric === "pages" ? "pages" : goal.target === 1 ? "book" : "books";
    const scope = [goal.period === "month" ? "This month" : "This year", goal.filterValue].filter(Boolean).join(" · ");
    const title = goalTitle(goal);

    const remove = async () => {
        if (!(await confirmDialog({ title: "Delete this goal?", text: `"${title}" will be removed. Your books aren't affected.` }))) return;
        await attempt(() => deleteCustomGoal(goal.id), "Goal deleted");
    };

    return (
        <li className={`custom-goal${done >= goal.target ? " is-done" : ""}`}>
            <div className="custom-goal-head">
                <div style={{ minWidth: 0 }}>
                    <h3>{title}</h3>
                    <p className="sub">{scope}</p>
                </div>
                <div className="custom-goal-actions">
                    <button className="icon-btn" type="button" aria-label={`Edit goal ${title}`} title="Edit" onClick={() => openGoalDialog(goal)}><Icon name="edit" /></button>
                    <button className="icon-btn" type="button" aria-label={`Delete goal ${title}`} title="Delete" onClick={remove}><Icon name="trash" /></button>
                </div>
            </div>
            <div className="custom-goal-bar">
                <ProgressBar value={pct} thin />
                <span className="goal-number-sm">{`${fmt.num(done)} / ${fmt.num(goal.target)} ${unit}`}</span>
            </div>
            {done >= goal.target ? <p className="goal-foot">Goal reached! 🎉</p> : null}
        </li>
    );
}

// ---------- Quote of the day ----------

function QuoteCard() {
    const books = useStore((s) => s.books);
    const all = useMemo(() => books.flatMap((b) => b.quotes.map((text) => ({ text, book: b }))), [books]);
    const pick = useMemo(() => quoteOfTheDay(all), [all]);

    return (
        <section className="card dash-card dash-quote" aria-labelledby="dashQuoteTitle">
            <div className="dash-card-head"><h2 id="dashQuoteTitle">Quote of the Day</h2></div>
            {pick
                ? (
                    <figure className="day-quote">
                        <blockquote>{pick.text}</blockquote>
                        <figcaption>— <a href={bookHref(pick.book.id)}>{pick.book.title}</a>{`, ${pick.book.author}`}</figcaption>
                    </figure>
                )
                : <p className="dash-empty">Save favourite lines in a book's Review. A new one shows here every day.</p>}
            {all.length > 1 ? <p className="dash-foot">{`A new quote every day · ${fmt.plural(all.length, "quote")} saved`}</p> : null}
        </section>
    );
}

// ---------- Next Up ----------

function NextUpCard() {
    const state = useStore((s) => s);
    const picks = useMemo(() => nextUpBooks(state), [state]);
    const ids = picks.map((b) => b.id);

    return (
        <section className="card dash-card dash-next" aria-labelledby="dashNextTitle">
            <div className="dash-card-head">
                <h2 id="dashNextTitle">Next Up</h2>
                <a href="#/library?status=To%20Be%20Read">Your TBR</a>
            </div>
            <ol className="next-slots">
                {Array.from({ length: NEXT_UP_MAX }, (_, i) => {
                    const book = picks[i];
                    if (!book) {
                        return (
                            <li key={`empty-${i}`} className="next-slot">
                                <button type="button" className="next-add" aria-label="Add a book to Next Up" onClick={() => openNextUpPicker(ids)}><Icon name="plus" /></button>
                            </li>
                        );
                    }
                    return (
                        <li key={book.id} className="next-slot">
                            <div className="next-book">
                                <a href={bookHref(book.id)} title={book.title} aria-label={book.title}><Cover book={book} size="md" /></a>
                                <button type="button" className="next-remove" aria-label={`Remove ${book.title} from Next Up`} title="Remove"
                                    onClick={() => attempt(() => saveNextUp(ids.filter((id) => id !== book.id)))}><Icon name="close" /></button>
                            </div>
                            <span className="next-title">{book.title}</span>
                        </li>
                    );
                })}
            </ol>
            <p className="dash-foot">{picks.length ? "Your next reads, in order. Start one by logging your reading." : "Pick your next reads from your TBR."}</p>
        </section>
    );
}

function openNextUpPicker(currentIds: string[]) {
    openDialog((done) => <NextUpPicker currentIds={currentIds} onClose={done} />);
}

function NextUpPicker({ currentIds, onClose }: { currentIds: string[]; onClose: () => void }) {
    const [choices] = useState(() => getState().books.filter((b) => b.status === "To Be Read" && !currentIds.includes(b.id))
        .sort((a, b) => a.title.localeCompare(b.title)));
    const closeRef = useRef<(() => void) | null>(null);
    const then = useRef<(() => void) | null>(null);
    // Close first, then act (as the vanilla dialog does).
    const closeThen = (action: () => void) => {
        then.current = action;
        closeRef.current?.();
    };

    return (
        <Modal title="Add to Next Up" closeRef={closeRef}
            onClose={() => {
                onClose();
                then.current?.();
            }}
            footer={<button type="button" className="link-btn left" onClick={() => closeThen(() => openAddBook())}>Add a new book to your TBR</button>}>
            {choices.length
                ? (
                    <div className="picker-list">
                        {choices.map((b) => (
                            <button key={b.id} type="button" className="picker-row"
                                onClick={() => closeThen(() => attempt(() => saveNextUp([...currentIds, b.id]), `"${b.title}" is up next`))}>
                                <Cover book={b} size="xs" />
                                <span className="picker-text"><strong>{b.title}</strong><small>{b.author}</small></span>
                                <Icon name="plus" />
                            </button>
                        ))}
                    </div>
                )
                : <p className="empty-sm">Every To Be Read book is already in Next Up, or your TBR is empty.</p>}
        </Modal>
    );
}

// ---------- Most recent entries ----------

function RecentEntriesCard() {
    const activities = useStore((s) => s.activities);
    const books = useStore((s) => s.books);
    const entries = activities.slice(0, 4);

    return (
        <section className="card dash-card dash-entries" aria-labelledby="dashEntriesTitle">
            <div className="dash-card-head"><h2 id="dashEntriesTitle">Most Recent Entries</h2></div>
            {entries.length
                ? (
                    <ul className="entries">
                        {entries.map((a) => {
                            const book = books.find((b) => b.id === String(a.book_id));
                            const shown = book || { title: a.book_title, author: "" };
                            const body = <>
                                <Cover book={shown} size="sm" />
                                <span className="entry-text">
                                    <strong className="entry-date">{dayLabel(a.session_date || a.created_at)}</strong>
                                    <span className="entry-pages">{a.pages_read > 0 ? `+${fmt.plural(a.pages_read, "page")} read` : a.chapter ? `Chapter ${a.chapter} note` : "Journal note"}</span>
                                    <span className="entry-book">{shown.title}</span>
                                    {a.note ? <span className="entry-note">{a.note}</span> : null}
                                </span>
                            </>;
                            return <li key={a.id}>{book ? <a className="entry" href={bookHref(book.id)}>{body}</a> : <div className="entry">{body}</div>}</li>;
                        })}
                    </ul>
                )
                : (
                    <div className="dash-empty">
                        <p>Your journal entries will show up here.</p>
                        <button className="btn btn-sm btn-primary" type="button" onClick={() => openLogReading()}><Icon name="pen" />Log your reading</button>
                    </div>
                )}
        </section>
    );
}
