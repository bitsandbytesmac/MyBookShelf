// Quote of the day (same algorithm as public/js/dashboard.js, so both versions pick the same quote).
//
// The pick is random-looking but reproducible: every quote gets a score from hash(day + quote) and the
// lowest score wins. So every reload and every device shows the same quote on the same (local) day, and
// the next day reshuffles. Adding or removing a different quote doesn't move the winner; on top of that,
// today's pick is remembered on this device so it stays put all day even if a new quote would outscore it.
// Yesterday's quote is skipped so it never shows twice in a row.
import type { Book } from "../api/types";
import { dayString, today } from "./dates";

export type Quote = { text: string; book: Book };

const QUOTE_PIN_KEY = "quoteOfTheDay";
const quoteKey = (q: Quote) => `${q.book.id}\n${q.text}`;

function hash32(text: string): number {
    let x = 0x811c9dc5; // FNV-1a, then a murmur3 finish so similar inputs spread out
    for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 0x01000193);
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
}

function rankQuotes(all: Quote[], day: string): Quote[] {
    return all.map((q) => ({ q, score: hash32(`${day}\n${quoteKey(q)}`) }))
        .sort((a, b) => a.score - b.score || quoteKey(a.q).localeCompare(quoteKey(b.q)))
        .map((r) => r.q);
}

function dayBefore(day: string): string {
    const [y, m, d] = day.split("-").map(Number);
    return dayString(new Date(y, m - 1, d - 1));
}

// The day's best-ranked quote that isn't the one shown the day before.
function pickFor(all: Quote[], day: string, previousKey: string | null): Quote {
    return rankQuotes(all, day).find((q) => all.length < 2 || quoteKey(q) !== previousKey)!;
}

// What was shown on `day`, worked out without storage: replay the picks of the two weeks before it.
// Skipping a repeat can change one day's pick, which changes what the next day must skip, so a single
// look back isn't enough; replaying settles on the same chain everywhere well within a few days.
function replayedPick(all: Quote[], day: string): string | null {
    const days = [day];
    for (let i = 0; i < 14; i++) days.unshift(dayBefore(days[0]));
    let previous: string | null = null;
    for (const d of days) previous = quoteKey(pickFor(all, d, previous));
    return previous;
}

function readPin(): { day: string; key: string } | null {
    try {
        return JSON.parse(localStorage.getItem(QUOTE_PIN_KEY) || "null");
    } catch {
        return null;
    }
}

export function quoteOfTheDay(all: Quote[], day = today()): Quote | null {
    if (!all.length) return null;
    const pin = readPin();
    const kept = pin?.day === day && all.find((q) => quoteKey(q) === pin.key);
    if (kept) return kept;

    // Yesterday's quote: the one this device actually showed if it remembers, else the replayed one.
    const yesterday = dayBefore(day);
    const shownYesterday = all.length < 2 ? null : pin?.day === yesterday ? pin.key : replayedPick(all, yesterday);
    const pick = pickFor(all, day, shownYesterday);
    try {
        localStorage.setItem(QUOTE_PIN_KEY, JSON.stringify({ day, key: quoteKey(pick) }));
    } catch {
        /* not essential */
    }
    return pick;
}
