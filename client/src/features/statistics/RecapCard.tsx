// Reading Recap (bottom of Statistics): a month calendar of the days you read, and what you read on the
// day you pick. Same markup and behaviour as public/js/recap.js.
//
// Data comes from the same journal (reading_activities) as the streak: the month view from
// GET /api/activities/recap?month=, the day view from GET /api/activities/recap/:date. Days in the
// current streak come from streakRun (the dashboard's streak), never a second streak calculation.
// Fetched months/days are cached until the journal changes (state.activityVersion).
import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { api } from "../../api";
import type { RecapDay, RecapEntry, RecapMonth } from "../../api/types";
import { Cover } from "../../components/BookBits";
import { fmt } from "../../components/format";
import { today } from "../../domain/dates";
import { streakRun } from "../../domain/goals";
import { useStore } from "../../store/useStore";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

type Entry<T> = { loading: true; data?: undefined; error?: undefined } | { data: T; loading?: undefined; error?: undefined } | { error: string; loading?: undefined; data?: undefined };

// ---------- Cache (module level: kept while you visit other pages) ----------

const cache = {
    version: -1,
    months: new Map<string, Entry<RecapMonth>>(),
    days: new Map<string, Entry<RecapDay>>()
};
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function dropCacheIfStale(version: number) {
    if (cache.version === version) return;
    cache.months.clear();
    cache.days.clear();
    cache.version = version;
}

// Starts a fetch once per key; the result lands in the cache only if the journal hasn't changed meanwhile.
function ensure<T>(map: Map<string, Entry<T>>, key: string, fetcher: (key: string) => Promise<T>) {
    if (map.has(key)) return; // errors stay until "Try again" clears them
    const version = cache.version;
    const loading: Entry<T> = { loading: true };
    map.set(key, loading);
    fetcher(key)
        .then((data): Entry<T> => ({ data }))
        .catch((error): Entry<T> => ({ error: (error as Error).message || "Something went wrong." }))
        .then((result) => {
            if (version !== cache.version || map.get(key) !== loading) return;
            map.set(key, result);
            notify();
        });
}

function retry(map: Map<string, unknown>, key: string) {
    map.delete(key);
    notify();
}

// The month and day being shown are kept too (until the page is reloaded), as in the vanilla app.
// firstDate: the earliest day ever logged, so "Previous month" stays usable while the next month loads.
const remembered: { month: string | null; selected: string | null; picked: boolean; firstDate: string | null | undefined } =
    { month: null, selected: null, picked: false, firstDate: undefined };

// ---------- Dates ----------

const monthOf = (date: string) => date.slice(0, 7);
const pad = (n: number) => String(n).padStart(2, "0");

function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function parseDay(date: string): Date {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
}

const monthLabel = (month: string) => parseDay(`${month}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const longDate = (date: string) => parseDay(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function localDay(value: string): string {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------- Card ----------

export function RecapCard() {
    const version = useStore((s) => s.activityVersion);
    const readingDays = useStore((s) => s.statistics?.readingDays);
    const [, rerender] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
        listeners.add(rerender);
        return () => {
            listeners.delete(rerender);
        };
    }, []);
    dropCacheIfStale(version);

    const now = today();
    const [view, setView] = useState(() => ({
        month: !remembered.month || remembered.month > monthOf(now) ? monthOf(now) : remembered.month,
        selected: remembered.selected,
        picked: remembered.picked
    }));
    const update = (change: Partial<typeof view>) => setView((v) => {
        const next = { ...v, ...change };
        Object.assign(remembered, next);
        return next;
    });

    useEffect(() => {
        ensure(cache.months, view.month, api.getRecapMonth);
    });
    const monthEntry: Entry<RecapMonth> = cache.months.get(view.month) || { loading: true };
    const data = monthEntry.data;
    if (data) remembered.firstDate = data.firstDate;

    // Until the reader picks a day, show the latest day they read in this month.
    const selected = view.selected || (data && !view.picked && data.days.length ? data.days[data.days.length - 1].date : null);

    // Focus: when the arrow just pressed gets disabled (first or current month), move to the other one.
    const prevRef = useRef<HTMLButtonElement>(null);
    const nextRef = useRef<HTMLButtonElement>(null);
    const pressed = useRef<"prev" | "next" | null>(null);
    const first = remembered.firstDate ? monthOf(remembered.firstDate) : null;
    const canPrev = Boolean(first && view.month > first);
    const canNext = view.month < monthOf(now);
    useLayoutEffect(() => {
        if (!pressed.current) return;
        const [mine, other] = pressed.current === "prev" ? [prevRef, nextRef] : [nextRef, prevRef];
        const target = [mine.current, other.current].find((el) => el && !el.disabled);
        if (mine.current?.disabled || document.activeElement === document.body) target?.focus();
        pressed.current = null;
    });

    const go = (delta: number, which: "prev" | "next") => {
        pressed.current = which;
        update({ month: shiftMonth(view.month, delta), selected: null, picked: false });
    };

    return (
        <section className="card card-pad recap" aria-labelledby="recapTitle">
            <div className="recap-head">
                <div>
                    <h3 id="recapTitle">Reading Recap</h3>
                    <p className="sub">Pick a day to see what you read.</p>
                </div>
                <div className="recap-nav">
                    <button ref={prevRef} className="btn btn-ghost btn-sm" type="button" aria-label="Previous month" data-focus="prev"
                        disabled={!canPrev} onClick={() => go(-1, "prev")}>‹</button>
                    <span className="recap-month" aria-live="polite">{monthLabel(view.month)}</span>
                    <button ref={nextRef} className="btn btn-ghost btn-sm" type="button" aria-label="Next month" data-focus="next"
                        disabled={!canNext} onClick={() => go(1, "next")}>›</button>
                </div>
            </div>
            <div className="recap-body">
                <div className="recap-cal-wrap">
                    <Calendar month={view.month} entry={monthEntry} now={now} selected={selected} readingDays={readingDays}
                        onPick={(date) => update({ selected: date, picked: true })} />
                </div>
                <DayPanel selected={selected} hasReadingDays={Boolean(readingDays?.length)} />
            </div>
        </section>
    );
}

function Calendar({ month, entry, now, selected, readingDays, onPick }: {
    month: string; entry: Entry<RecapMonth>; now: string; selected: string | null; readingDays: string[] | undefined; onPick: (date: string) => void;
}) {
    const streak = useMemo(() => new Set(streakRun(readingDays || [])), [readingDays]);

    if (entry.error !== undefined) {
        return (
            <div className="recap-error" role="alert">
                <p>{`Couldn't load your reading for ${monthLabel(month)}. ${entry.error}`}</p>
                <button className="btn btn-sm" type="button" onClick={() => retry(cache.months, month)}>Try again</button>
            </div>
        );
    }

    const byDate = new Map((entry.data?.days || []).map((d) => [d.date, d]));
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first
    const totals = entry.data?.totals;
    const summary = entry.loading ? "Loading…"
        : !totals?.days ? `Nothing logged in ${monthLabel(month).split(" ")[0]}.`
            : `Read on ${fmt.plural(totals.days, "day")}${totals.pages ? ` · ${fmt.plural(totals.pages, "page")}` : ""}`;

    return (
        <div className={`recap-cal${entry.loading ? " is-loading" : ""}`} aria-busy={Boolean(entry.loading)}>
            <div className="cal-grid recap-grid">
                {WEEKDAYS.map((w, i) => <span key={`h${i}`} className="cal-head" aria-hidden="true">{w}</span>)}
                {Array.from({ length: offset }, (_, i) => <span key={`b${i}`} className="cal-day is-blank" aria-hidden="true" />)}
                {Array.from({ length: daysInMonth }, (_, i) => {
                    const date = `${month}-${pad(i + 1)}`;
                    const info = byDate.get(date);
                    const classes = ["cal-day", "recap-day",
                        info ? "is-read" : "", streak.has(date) ? "is-streak" : "",
                        date === now ? "is-today" : "", date === selected ? "is-selected" : ""].filter(Boolean).join(" ");
                    if (date > now) return <span key={date} className={`${classes} is-future`} aria-hidden="true">{i + 1}</span>;

                    const what = info
                        ? [info.pages ? fmt.plural(info.pages, "page") : null, info.entries === 1 ? "1 entry" : `${fmt.num(info.entries)} entries`].filter(Boolean).join(", ")
                        : "nothing logged";
                    return (
                        <button key={date} className={classes} type="button" data-focus={`day-${date}`} aria-pressed={date === selected}
                            aria-label={`${longDate(date)}: ${what}${streak.has(date) ? " (part of your streak)" : ""}`}
                            title={info ? `${fmt.date(date)}: ${what}` : fmt.date(date)}
                            onClick={() => onPick(date)}>{i + 1}</button>
                    );
                })}
            </div>
            <p className="recap-summary">{summary}</p>
            <div className="recap-legend" aria-hidden="true">
                <span><i className="cal-day is-read" />Read</span>
                <span><i className="cal-day is-streak" />Current streak</span>
                <span><i className="cal-day is-today" />Today</span>
            </div>
        </div>
    );
}

function DayPanel({ selected, hasReadingDays }: { selected: string | null; hasReadingDays: boolean }) {
    const books = useStore((s) => s.books);
    useEffect(() => {
        if (selected) ensure(cache.days, selected, api.getRecapDay);
    });

    if (!selected) {
        return (
            <div className="recap-day-panel" aria-live="polite">
                <p className="empty-sm">{hasReadingDays ? "Pick a day on the calendar." : "Log your reading and the days you read will show up here."}</p>
            </div>
        );
    }

    const entry: Entry<RecapDay> = cache.days.get(selected) || { loading: true };
    let body;
    if (entry.loading) body = <p className="hint">Loading…</p>;
    else if (entry.error !== undefined) {
        body = (
            <div className="recap-error" role="alert">
                <p>{`Couldn't load this day. ${entry.error}`}</p>
                <button className="btn btn-sm" type="button" onClick={() => retry(cache.days, selected)}>Try again</button>
            </div>
        );
    } else if (!entry.data.entries.length) body = <p className="empty-sm">No reading logged on this day.</p>;
    else {
        const { entries, pages } = entry.data;
        const count = new Set(entries.map((e) => e.bookId || e.title)).size;
        body = <>
            <p className="recap-day-sum">{[fmt.plural(count, "book"), pages ? fmt.plural(pages, "page") : null, entries.length > 1 ? `${entries.length} entries` : null].filter(Boolean).join(" · ")}</p>
            <ul className="recap-entries" aria-label={`Reading on ${longDate(selected)}`}>
                {entries.map((e) => <EntryRow key={e.id} entry={e} exists={Boolean(e.bookId && books.some((b) => b.id === e.bookId))} />)}
            </ul>
        </>;
    }

    return (
        <div className="recap-day-panel" aria-live="polite">
            <h4 className="recap-date">{longDate(selected)}</h4>
            {body}
        </div>
    );
}

function EntryRow({ entry: e, exists }: { entry: RecapEntry; exists: boolean }) {
    let progress;
    if (e.pagesRead > 0) {
        const of = e.totalPages ? ` of ${fmt.num(e.totalPages)} (${Math.min(100, Math.round((e.currentPage / e.totalPages) * 100))}%)` : "";
        progress = `+${fmt.plural(e.pagesRead, "page")} · p. ${fmt.num(e.previousPage)} → ${fmt.num(e.currentPage)}${of}`;
    } else {
        progress = e.note ? "Journal note" : "Progress update";
    }
    if (e.chapter) progress = `Chapter ${e.chapter} · ${progress}`;

    // An entry saved on the same day shows its time; one logged later for this day says when it was written.
    const savedOn = localDay(e.createdAt);
    const when = !savedOn ? ""
        : savedOn === e.sessionDate
            ? `Logged at ${new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
            : `Logged on ${fmt.date(savedOn)}`;

    return (
        <li className="recap-entry">
            <Cover book={{ title: e.title, author: e.author, coverUrl: e.coverUrl }} size="xs" />
            <div className="recap-entry-body">
                {exists ? <a href={`#/book/${e.bookId}`} className="recap-title">{e.title}</a> : <span className="recap-title">{e.title}</span>}
                {e.author ? <span className="recap-author">{e.author}</span> : null}
                <span className="recap-progress">{progress}</span>
                {e.note ? <p className="recap-note">{e.note}</p> : null}
                {when ? <span className="recap-when">{when}</span> : null}
            </div>
        </li>
    );
}
