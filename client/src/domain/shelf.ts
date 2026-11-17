// Authors and series are derived from the books; nothing extra is stored.
import type { Book } from "../api/types";

export const nameKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

// "Ilona Andrews, Gordon Andrews" or "A & B" -> each author gets the book on their page.
export function authorNames(book: Pick<Book, "author">): string[] {
    return [...new Set((book.author || "").split(/\s*[,&]\s*/).map((n) => n.trim()).filter(Boolean))];
}

// Book number order, then unnumbered books by title.
export function bySeriesOrder(a: Book, b: Book): number {
    const x = a.seriesNumber ?? Infinity, y = b.seriesNumber ?? Infinity;
    return x !== y ? x - y : a.title.localeCompare(b.title);
}

export type Group = { key: string; name: string; books: Book[] };

function group(books: Book[], keysOf: (book: Book) => string[]): Group[] {
    const map = new Map<string, Group>();
    for (const book of books) {
        for (const name of keysOf(book)) {
            const key = nameKey(name);
            if (!map.has(key)) map.set(key, { key, name, books: [] });
            map.get(key)!.books.push(book);
        }
    }
    return [...map.values()];
}

export function authorsList(books: Book[]): Group[] {
    return group(books, authorNames);
}

export function findAuthor(books: Book[], name: string): Group | null {
    return authorsList(books).find((a) => a.key === nameKey(name || "")) || null;
}

export type SeriesStatus = "Completed" | "In progress" | "Not started";

export type SeriesSummary = Group & {
    read: number;
    total: number | null;      // the "Books in series" the reader entered (null if never set)
    outOf: number;             // total, else the books on the shelf
    next: Book | null;
    status: SeriesStatus;
    authors: string[];
    onShelf: number;           // main books on the shelf (novellas don't take one of the total's places)
    missing: number;           // places still open
    percent: number;
};

// With a total set, novellas (1.5, 2.5...) don't count toward it, so "3 of 3" means the main books.
export function summarizeSeries(series: Group): SeriesSummary {
    const books = [...series.books].sort(bySeriesOrder);
    const total = Math.max(0, ...books.map((b) => b.seriesTotal || 0)) || null;
    const finished = books.filter((b) => b.status === "Read");
    const isMain = (b: Book) => b.seriesNumber == null || Number.isInteger(b.seriesNumber);
    const counted = total ? finished.filter(isMain) : finished;
    const outOf = total || books.length;
    const read = Math.min(counted.length, outOf);
    const inProgress = books.find((b) => b.status === "Reading" || b.status === "Paused");
    const next = inProgress || books.find((b) => b.status === "To Be Read") || null;
    const status: SeriesStatus = read >= outOf ? "Completed" : finished.length || inProgress ? "In progress" : "Not started";
    const authors = [...new Set(books.flatMap(authorNames))];
    const onShelf = books.filter(isMain).length;
    const missing = total ? Math.max(0, total - onShelf) : 0;
    return { ...series, books, read, total, outOf, next, status, authors, onShelf, missing, percent: Math.round((read / outOf) * 100) };
}

export function seriesList(books: Book[]): SeriesSummary[] {
    return group(books, (b) => (b.series ? [b.series] : [])).map(summarizeSeries);
}

export function findSeries(books: Book[], name: string): SeriesSummary | null {
    return seriesList(books).find((s) => s.key === nameKey(name || "")) || null;
}

// Can another book still join this series? Not when it's Completed, and not when "Books in series"
// is set and every place is already on the shelf. Without a total there's no limit.
export function seriesHasRoom(series: SeriesSummary): boolean {
    return series.status !== "Completed" && (!series.total || series.missing > 0);
}

// The series offered when picking one for a book: those with room, plus the book's current series
// (so editing a book never drops or hides the series it's already in). Sorted by name.
export function seriesChoicesFor(books: Book[], book: Partial<Book> = {}): SeriesSummary[] {
    const current = book.series ? nameKey(book.series) : null;
    return seriesList(books)
        .filter((s) => s.key === current || seriesHasRoom(s))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The saved spelling of a series typed in any case/spacing ("  harry   potter" -> "Harry Potter"), else the cleaned text.
export function canonicalSeriesName(books: Book[], name: string): string {
    const clean = (name || "").trim().replace(/\s+/g, " ");
    return clean ? findSeries(books, clean)?.name || clean : "";
}
