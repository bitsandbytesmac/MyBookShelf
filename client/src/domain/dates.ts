// Calendar dates as "YYYY-MM-DD" in the reader's own time zone.
// The server runs in UTC, so the reader's "today" is always sent from here (see src/utils/dates.js).

export function dayString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function today(): string {
    return dayString(new Date());
}
