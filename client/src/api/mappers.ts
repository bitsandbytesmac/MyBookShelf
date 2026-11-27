import type { Book, BookStatus } from "./types";

// Database row (snake_case) <-> UI book (camelCase). Same rules as public/js/api.js.
// When a book field is added: update the server's parseBook + COLUMNS and both functions here.

export type BookRow = Record<string, unknown> & { id: string | number; title: string; author: string; status: BookStatus };

const dateOnly = (value: unknown) => (value ? String(value).slice(0, 10) : null);
const list = (value: unknown) => (Array.isArray(value) ? (value as string[]) : []);
const numOrNull = (value: unknown) => (value != null ? Number(value) : null); // NUMERIC arrives as a string

export function normalizeBook(row: BookRow): Book {
    const genres = list(row.genres).length ? list(row.genres) : row.genre ? [String(row.genre)] : [];
    return {
        id: String(row.id),
        title: row.title,
        author: row.author,
        summary: (row.summary as string) || "",
        coverUrl: (row.cover_url as string) || null,
        series: (row.series as string) || "",
        seriesNumber: numOrNull(row.series_number),
        seriesTotal: numOrNull(row.series_total),
        genres,
        subgenres: list(row.subgenres),
        tropes: list(row.tropes),
        contentWarnings: list(row.content_warnings),
        themes: list(row.themes),
        characters: list(row.characters),
        setting: (row.setting as string) || "",
        publishedYear: numOrNull(row.published_year),
        format: (row.format as string) || "",
        ownership: (row.ownership as string) || "",
        ageDemos: list(row.age_demos).length ? list(row.age_demos) : row.age_category ? [String(row.age_category)] : [],
        status: row.status,
        totalPages: Number(row.total_pages) || 0,
        currentPage: Number(row.current_page) || 0,
        chapterCount: numOrNull(row.chapter_count),
        rating: row.rating ? Number(row.rating) : null,
        spice: row.spice ? Number(row.spice) : null,
        quotes: list(row.quotes),
        review: (row.review as string) || "",
        notes: (row.personal_notes as string) || "",
        dateStarted: dateOnly(row.date_started),
        dateFinished: dateOnly(row.date_finished),
        isFavorite: Boolean(row.is_favorite),
        reviewed: Boolean(row.reviewed),
        journaled: Boolean(row.journaled),
        isPhysical: Boolean(row.is_physical),
        isReread: Boolean(row.is_reread),
        goodreadsUrl: (row.goodreads_url as string) || "",
        createdAt: (row.created_at as string) || null
    };
}

// PUT /api/books/:id replaces the whole book, so this always sends every field.
// Typed against Book, so a field added there and forgotten here is a compile error.
// (Themes and characters are no longer edited, so they aren't sent; the server keeps what's stored.)
export type BookPayload = { [K in keyof Omit<Book, "id" | "createdAt" | "themes" | "characters">]: unknown };

export function toPayload(book: Partial<Book>): BookPayload {
    return {
        title: book.title,
        author: book.author,
        summary: book.summary || null,
        coverUrl: book.coverUrl || null,
        series: book.series || null,
        seriesNumber: book.series ? book.seriesNumber ?? null : null,
        seriesTotal: book.series ? book.seriesTotal ?? null : null,
        genres: book.genres || [],
        subgenres: book.subgenres || [],
        tropes: book.tropes || [],
        contentWarnings: book.contentWarnings || [],
        setting: book.setting || null,
        publishedYear: book.publishedYear ?? null,
        format: book.format || null,
        ownership: book.ownership || null,
        ageDemos: book.ageDemos || [],
        status: book.status,
        totalPages: book.totalPages || 0,
        currentPage: book.currentPage || 0,
        chapterCount: book.chapterCount ?? null,
        rating: book.rating || null,
        spice: book.spice || null,
        quotes: book.quotes || [],
        review: book.review || null,
        notes: book.notes || null,
        dateStarted: book.dateStarted || null,
        dateFinished: book.dateFinished || null,
        isFavorite: Boolean(book.isFavorite),
        reviewed: Boolean(book.reviewed),
        journaled: Boolean(book.journaled),
        isPhysical: Boolean(book.isPhysical),
        isReread: Boolean(book.isReread),
        goodreadsUrl: book.goodreadsUrl || null
    };
}
