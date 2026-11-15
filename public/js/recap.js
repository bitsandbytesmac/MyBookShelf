// Reading Recap (Statistics page): a month calendar of the days you read, and what you read on the day you pick.
//
// Data comes from the same journal (reading_activities) as the streak: the month view from
// GET /api/activities/recap?month=, the day view from GET /api/activities/recap/:date. Days in the
// current streak are taken from store.streakRun, so the recap never computes a streak of its own.
// Fetched months/days are cached until the journal changes (state.activityVersion).
import { state, streakRun, today } from "./store.js";
import { api } from "./api.js";
import { h, fmt, cover } from "./ui.js";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// firstDate: the earliest day ever logged (from any loaded month), so "Previous month" stays usable while the next month loads.
const view = { month: null, selected: null, picked: false, focus: null, firstDate: undefined };
const months = new Map(); // "YYYY-MM"    -> { loading } | { data } | { error }
const days = new Map();   // "YYYY-MM-DD" -> same
let cacheVersion = -1;
let current = null;       // the card on screen, so a finished fetch can redraw just this card

const monthOf = (date) => date.slice(0, 7);
const pad = (n) => String(n).padStart(2, "0");

function shiftMonth(month, delta) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

function parseDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
}

const monthLabel = (month) => parseDay(`${month}-01`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const longDate = (date) => parseDay(date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

function localDay(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function redraw() {
    if (!current?.isConnected) return;
    // Keep keyboard focus on the same control across the redraw (e.g. when a fetch finishes).
    const active = current.contains(document.activeElement) ? document.activeElement.dataset.focus : null;
    if (active && !view.focus) view.focus = active;
    current.replaceWith(recapCard());
}

// Starts a fetch once per key; the result lands in the cache only if the journal hasn't changed meanwhile.
function load(map, key, fetcher) {
    const entry = map.get(key);
    if (entry) return entry; // errors stay until "Try again" (retry) clears them
    const version = cacheVersion;
    const loading = { loading: true };
    map.set(key, loading);
    fetcher(key)
        .then((data) => ({ data }))
        .catch((error) => ({ error: error.message || "Something went wrong." }))
        .then((result) => {
            if (version !== cacheVersion || map.get(key) !== loading) return;
            map.set(key, result);
            redraw();
        });
    return loading;
}

function retry(map, key) {
    map.delete(key);
    redraw();
}

function choose(updates, focus) {
    Object.assign(view, updates, { focus });
    redraw();
}

export function recapCard() {
    if (state.activityVersion !== cacheVersion) {
        months.clear();
        days.clear();
        cacheVersion = state.activityVersion;
    }
    const now = today();
    if (!view.month || view.month > monthOf(now)) view.month = monthOf(now);

    const monthEntry = load(months, view.month, api.getRecapMonth);
    const data = monthEntry.data;
    if (data) view.firstDate = data.firstDate;

    // Until the reader picks a day, show the latest day they read in this month.
    if (data && !view.picked && !view.selected && data.days.length) view.selected = data.days[data.days.length - 1].date;

    const card = h("section", { class: "card card-pad recap", "aria-labelledby": "recapTitle" },
        h("div", { class: "recap-head" },
            h("div", {},
                h("h3", { id: "recapTitle" }, "Reading Recap"),
                h("p", { class: "sub" }, "Pick a day to see what you read.")),
            monthNav(now)),
        h("div", { class: "recap-body" },
            h("div", { class: "recap-cal-wrap" }, calendar(monthEntry, now)),
            dayPanel()));

    current = card;
    if (view.focus) {
        // If the pressed arrow just got disabled (first or current month), keep focus on the other one.
        const other = { prev: "next", next: "prev" }[view.focus];
        const target = [view.focus, other].filter(Boolean)
            .map((key) => card.querySelector(`[data-focus="${key}"]`))
            .find((el) => el && !el.disabled);
        view.focus = null;
        if (target) queueMicrotask(() => target.focus());
    }
    return card;
}

function monthNav(now) {
    const first = view.firstDate ? monthOf(view.firstDate) : null;
    const canPrev = Boolean(first && view.month > first);
    const canNext = view.month < monthOf(now);
    const go = (delta, focus) => choose({ month: shiftMonth(view.month, delta), selected: null, picked: false }, focus);

    return h("div", { class: "recap-nav" },
        h("button", {
            class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Previous month", "data-focus": "prev",
            disabled: !canPrev, onclick: () => go(-1, "prev")
        }, "‹"),
        h("span", { class: "recap-month", "aria-live": "polite" }, monthLabel(view.month)),
        h("button", {
            class: "btn btn-ghost btn-sm", type: "button", "aria-label": "Next month", "data-focus": "next",
            disabled: !canNext, onclick: () => go(1, "next")
        }, "›"));
}

function calendar(entry, now) {
    if (entry.error) {
        return h("div", { class: "recap-error", role: "alert" },
            h("p", {}, `Couldn't load your reading for ${monthLabel(view.month)}. ${entry.error}`),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => retry(months, view.month) }, "Try again"));
    }

    const byDate = new Map((entry.data?.days || []).map((d) => [d.date, d]));
    const streak = new Set(streakRun());
    const [y, m] = view.month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7; // Monday first

    const cells = Array.from({ length: daysInMonth }, (_, i) => {
        const date = `${view.month}-${pad(i + 1)}`;
        const info = byDate.get(date);
        const classes = ["cal-day", "recap-day",
            info ? "is-read" : "", streak.has(date) ? "is-streak" : "",
            date === now ? "is-today" : "", date === view.selected ? "is-selected" : ""].filter(Boolean).join(" ");
        if (date > now) return h("span", { class: `${classes} is-future`, "aria-hidden": "true" }, String(i + 1));

        const what = info
            ? [info.pages ? fmt.plural(info.pages, "page") : null, (info.entries === 1 ? "1 entry" : `${fmt.num(info.entries)} entries`)].filter(Boolean).join(", ")
            : "nothing logged";
        return h("button", {
            class: classes, type: "button", "data-focus": `day-${date}`,
            "aria-pressed": String(date === view.selected),
            "aria-label": `${longDate(date)}: ${what}${streak.has(date) ? " (part of your streak)" : ""}`,
            title: info ? `${fmt.date(date)}: ${what}` : fmt.date(date),
            onclick: () => choose({ selected: date, picked: true }, `day-${date}`)
        }, String(i + 1));
    });

    const totals = entry.data?.totals;
    const summary = entry.loading ? "Loading…"
        : !totals?.days ? `Nothing logged in ${monthLabel(view.month).split(" ")[0]}.`
        : `Read on ${fmt.plural(totals.days, "day")}${totals.pages ? ` · ${fmt.plural(totals.pages, "page")}` : ""}`;

    return h("div", { class: `recap-cal${entry.loading ? " is-loading" : ""}`, "aria-busy": String(Boolean(entry.loading)) },
        h("div", { class: "cal-grid recap-grid" },
            WEEKDAYS.map((w) => h("span", { class: "cal-head", "aria-hidden": "true" }, w)),
            Array.from({ length: offset }, () => h("span", { class: "cal-day is-blank", "aria-hidden": "true" })),
            cells),
        h("p", { class: "recap-summary" }, summary),
        h("div", { class: "recap-legend", "aria-hidden": "true" },
            h("span", {}, h("i", { class: "cal-day is-read" }), "Read"),
            h("span", {}, h("i", { class: "cal-day is-streak" }), "Current streak"),
            h("span", {}, h("i", { class: "cal-day is-today" }), "Today")));
}

function dayPanel() {
    const panel = h("div", { class: "recap-day-panel", "aria-live": "polite" });
    if (!view.selected) {
        panel.append(h("p", { class: "empty-sm" }, state.statistics?.readingDays?.length
            ? "Pick a day on the calendar."
            : "Log your reading and the days you read will show up here."));
        return panel;
    }

    const entry = load(days, view.selected, api.getRecapDay);
    panel.append(h("h4", { class: "recap-date" }, longDate(view.selected)));

    if (entry.loading) {
        panel.append(h("p", { class: "hint" }, "Loading…"));
    } else if (entry.error) {
        panel.append(h("div", { class: "recap-error", role: "alert" },
            h("p", {}, `Couldn't load this day. ${entry.error}`),
            h("button", { class: "btn btn-sm", type: "button", onclick: () => retry(days, view.selected) }, "Try again")));
    } else if (!entry.data.entries.length) {
        panel.append(h("p", { class: "empty-sm" }, "No reading logged on this day."));
    } else {
        const { entries, pages } = entry.data;
        const books = new Set(entries.map((e) => e.bookId || e.title)).size;
        panel.append(
            h("p", { class: "recap-day-sum" }, [
                fmt.plural(books, "book"),
                pages ? fmt.plural(pages, "page") : null,
                entries.length > 1 ? `${entries.length} entries` : null
            ].filter(Boolean).join(" · ")),
            h("ul", { class: "recap-entries", "aria-label": `Reading on ${longDate(view.selected)}` }, entries.map(entryRow)));
    }
    return panel;
}

function entryRow(e) {
    const exists = e.bookId && state.books.some((b) => b.id === e.bookId);
    const title = exists ? h("a", { href: `#/book/${e.bookId}`, class: "recap-title" }, e.title) : h("span", { class: "recap-title" }, e.title);

    let progress;
    if (e.pagesRead > 0) {
        const of = e.totalPages ? ` of ${fmt.num(e.totalPages)} (${Math.min(100, Math.round((e.currentPage / e.totalPages) * 100))}%)` : "";
        progress = `+${fmt.plural(e.pagesRead, "page")} · p. ${fmt.num(e.previousPage)} → ${fmt.num(e.currentPage)}${of}`;
    } else {
        progress = e.note ? "Journal note" : "Progress update";
    }

    // An entry saved on the same day shows its time; one logged later for this day says when it was written.
    const savedOn = localDay(e.createdAt);
    const when = !savedOn ? ""
        : savedOn === e.sessionDate
            ? `Logged at ${new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
            : `Logged on ${fmt.date(savedOn)}`;

    return h("li", { class: "recap-entry" },
        cover({ title: e.title, author: e.author, coverUrl: e.coverUrl }, "xs"),
        h("div", { class: "recap-entry-body" },
            title,
            e.author ? h("span", { class: "recap-author" }, e.author) : null,
            h("span", { class: "recap-progress" }, progress),
            e.note ? h("p", { class: "recap-note" }, e.note) : null,
            when ? h("span", { class: "recap-when" }, when) : null));
}
