// Calendar dates ("YYYY-MM-DD") as the reader sees them.
//
// The server (Vercel/Neon) runs in UTC, so its CURRENT_DATE can be a day off from the reader's own
// calendar: in UTC+8, reading at 7 am is still "yesterday" in UTC. The browser therefore sends its
// local date, and we trust it as long as it is within a day of the server's UTC date (every real
// time zone is between UTC-12 and UTC+14). Anything else falls back to the server's date.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30).
export function isCalendarDate(value) {
    const m = typeof value === "string" ? DATE_RE.exec(value) : null;
    if (!m) return false;
    const [y, mo, d] = m.slice(1).map(Number);
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

const utcDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

// The reader's "today" if it is plausible, else null (callers then use the database's CURRENT_DATE).
export function readerToday(value) {
    if (!isCalendarDate(value)) return null;
    return value >= utcDay(-1) && value <= utcDay(1) ? value : null;
}
