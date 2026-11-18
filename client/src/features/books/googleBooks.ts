// Google Books results -> books to add (same rules as public/js/dialogs.js).
import type { Book, GoogleVolume } from "../../api/types";
import { GENRES } from "../../domain/constants";
import { canonicalSeriesName } from "../../domain/shelf";
import { stripHtml } from "../../components/format";

function genresFromCategories(categories: string[] = []): string[] {
    const parts = categories.flatMap((c) => c.split("/").map((p) => p.trim())).filter(Boolean);
    const known = parts.map((p) => GENRES.find((g) => g.toLowerCase() === p.toLowerCase())).filter((g): g is string => Boolean(g));
    if (known.length) return [...new Set(known)];
    return parts.length ? [parts[0]] : [];
}

// "A Court of Mist and Fury (A Court of Thorns and Roses, Book 2)" or "Catching Fire (The Hunger Games #2)"
// -> title without the bracket, plus the series name and number.
export function splitSeriesFromTitle(rawTitle = ""): { title: string; series: string; seriesNumber: number | null } {
    const m = rawTitle.match(/^(.*\S)\s*\(([^()]+?)[,\s]\s*(?:Book|Bk\.?|Vol\.?|Volume|#)\s*(\d+(?:\.\d+)?)\)\s*$/i);
    if (!m) return { title: rawTitle, series: "", seriesNumber: null };
    return { title: m[1], series: m[2].replace(/[,\s]+$/, "").trim(), seriesNumber: Number(m[3]) };
}

export type GoogleBook = Pick<Book, "title" | "series" | "seriesNumber" | "author" | "coverUrl" | "summary" | "totalPages" | "genres" | "publishedYear"> & { year: string };

export function fromGoogle(item: GoogleVolume, books: Book[]): GoogleBook {
    const info = item.volumeInfo || {};
    const thumb = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
        .replace(/^http:/, "https:")
        .replace("&edge=curl", "");
    const { title, series, seriesNumber } = splitSeriesFromTitle(info.title || "Untitled");
    const year = info.publishedDate?.slice(0, 4) || "";
    return {
        title: info.subtitle ? `${title}: ${info.subtitle}` : title,
        series: canonicalSeriesName(books, series),
        seriesNumber: series ? seriesNumber : null,
        author: info.authors?.join(", ") || "Unknown author",
        coverUrl: thumb || null,
        summary: stripHtml(info.description || ""),
        totalPages: info.pageCount || 0,
        genres: genresFromCategories(info.categories),
        year,
        publishedYear: /^\d{4}$/.test(year) ? Number(year) : null
    };
}

// For challenge discovery: a Google Books result as a book to add.
export function bookFromGoogle(item: GoogleVolume, books: Book[]) {
    const { year: _year, ...book } = fromGoogle(item, books);
    void _year;
    return book;
}
