import type { Book, HiddenTags } from "../api/types";
import { TAG_DEFAULTS, type TagKind } from "./constants";
import { today } from "./dates";

export function percent(book: Pick<Book, "totalPages" | "currentPage" | "status">): number {
    if (!book.totalPages) return book.status === "Read" ? 100 : 0;
    return Math.min(100, Math.round((book.currentPage / book.totalPages) * 100));
}

type RuleBook = Pick<Book, "status" | "totalPages" | "currentPage" | "dateStarted" | "dateFinished">;

// Keep status, current page and dates consistent with each other.
export function applyReadingRules<T extends RuleBook>(next: T, previous: RuleBook | null = null): T {
    const book = { ...next };
    const prevStatus = previous?.status ?? "To Be Read";

    if (book.totalPages > 0 && book.currentPage > book.totalPages) book.currentPage = book.totalPages;

    // Reaching the last page finishes the book.
    const reachedEnd = book.totalPages > 0 && book.currentPage >= book.totalPages;
    if (reachedEnd && ["To Be Read", "Reading", "Paused"].includes(book.status)) book.status = "Read";

    // Logging pages on a TBR book means you've started it.
    if (book.currentPage > 0 && book.status === "To Be Read") book.status = "Reading";

    // Marking as Read jumps to the last page.
    if (book.status === "Read" && book.totalPages > 0) book.currentPage = book.totalPages;

    // Dates: fill in when the status changes, never overwrite what the user set.
    const changed = book.status !== prevStatus;
    if (changed && book.status !== "To Be Read" && !book.dateStarted) {
        book.dateStarted = book.dateFinished && book.dateFinished < today() ? book.dateFinished : today();
    }
    if (changed && book.status === "Read" && !book.dateFinished) book.dateFinished = today();
    if (changed && prevStatus === "Read" && book.status !== "Read" && previous?.dateFinished === book.dateFinished) {
        book.dateFinished = null;
    }
    if (book.dateStarted && book.dateFinished && book.dateFinished < book.dateStarted) {
        book.dateStarted = book.dateFinished;
    }

    return book;
}

// The choices for a tag list: the defaults plus every value in use, minus the ones the reader deleted.
// (A value already on the book being edited still shows: the multi-select always lists its own selection.)
export function tagOptions(books: Book[], kind: TagKind = "genres", hidden?: HiddenTags | null): string[] {
    const gone = new Set((hidden?.[kind] || []).map((v) => v.toLowerCase()));
    return [...new Set([...TAG_DEFAULTS[kind], ...books.flatMap((b) => b[kind] || [])])].filter((v) => !gone.has(v.toLowerCase()));
}

export function booksFinished(books: Book[], { year, month }: { year?: number; month?: number } = {}): Book[] {
    return books.filter((b) => {
        if (b.status !== "Read" || !b.dateFinished) return false;
        const [y, m] = b.dateFinished.split("-").map(Number);
        return (year === undefined || y === year) && (month === undefined || m === month);
    });
}
