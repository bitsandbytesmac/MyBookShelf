// Central app state. Views subscribe and re-render on change.
import { api } from "./api.js";

export const STATUSES = ["To Be Read", "Reading", "Read", "Paused", "DNF"];
export const FORMATS = ["Paperback", "Hardbound", "E-book", "Audiobook"];
export const OWNERSHIP = ["Owned", "Borrowed", "Gifted"];

export const GENRES = [
    "Romance", "Fantasy", "Science Fiction", "Mystery", "Thriller", "Horror", "Historical Fiction",
    "Literary Fiction", "Contemporary", "Young Adult", "New Adult", "Classics", "Non-fiction",
    "Memoir", "Biography", "Self-help", "Poetry", "Graphic Novel"
];

export const SUBGENRES = [
    "Romantasy", "Contemporary Romance", "Romantic Comedy", "Dark Romance", "Historical Romance",
    "Paranormal Romance", "Sports Romance", "Epic Fantasy", "High Fantasy", "Urban Fantasy",
    "Dark Fantasy", "Cozy Fantasy", "Fairy Tale Retelling", "Mythology", "Dystopian", "Space Opera",
    "Cozy Mystery", "Psychological Thriller", "Crime", "Gothic", "Magical Realism", "Coming of Age",
    "Women's Fiction", "Family Saga"
];

const listeners = new Set();

export const state = {
    books: [],
    activities: [],
    statistics: null,
    goals: { monthlyGoal: 2, yearlyGoal: 12 },
    loaded: false
};

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function emit() {
    listeners.forEach((fn) => fn(state));
}

export function getBook(id) {
    return state.books.find((book) => book.id === String(id));
}

// Every genre/sub-genre in use, plus the defaults.
export function genreOptions(kind = "genres") {
    const defaults = kind === "genres" ? GENRES : SUBGENRES;
    const used = state.books.flatMap((b) => b[kind]);
    return [...new Set([...defaults, ...used])];
}

// ---------- Loading ----------

export async function loadAll() {
    const [books, goals] = await Promise.all([
        api.getBooks(),
        api.getGoals().catch(() => null),
        refreshActivity({ silent: true })
    ]);
    state.books = books;
    if (goals) state.goals = goals;
    state.loaded = true;
    emit();
}

export async function refreshActivity({ silent = false } = {}) {
    try {
        const [activities, statistics] = await Promise.all([api.getActivities(), api.getStatistics()]);
        state.activities = activities;
        state.statistics = statistics;
    } catch (error) {
        console.error("Failed to load reading activity:", error);
    }
    if (!silent) emit();
}

// ---------- Rules ----------

export function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function percent(book) {
    if (!book.totalPages) return book.status === "Read" ? 100 : 0;
    return Math.min(100, Math.round((book.currentPage / book.totalPages) * 100));
}

// Keep status, current page and dates consistent with each other.
export function applyReadingRules(next, previous = null) {
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

// ---------- Mutations ----------

export async function createBook(data) {
    const saved = await api.createBook(applyReadingRules({
        status: "To Be Read", genres: [], subgenres: [], quotes: [], isFavorite: false, ...data
    }));
    state.books.unshift(saved);
    emit();
    return saved;
}

export async function updateBook(id, changes) {
    const current = getBook(id);
    if (!current) throw new Error("Book not found.");

    const previousPage = current.currentPage;
    const next = applyReadingRules({ ...current, ...changes }, current);
    const saved = await api.updateBook(id, next);
    Object.assign(current, saved);

    // The server logs a reading session whenever the page count goes up.
    if (saved.currentPage > previousPage) await refreshActivity({ silent: true });

    emit();
    return current;
}

export async function deleteBook(id) {
    await api.deleteBook(id);
    state.books = state.books.filter((book) => book.id !== String(id));
    emit();
}

export async function saveGoals(goals) {
    state.goals = await api.updateGoals(goals);
    emit();
}

// ---------- Derived ----------

export function booksFinished({ year, month } = {}) {
    return state.books.filter((b) => {
        if (b.status !== "Read" || !b.dateFinished) return false;
        const [y, m] = b.dateFinished.split("-").map(Number);
        return (year === undefined || y === year) && (month === undefined || m === month);
    });
}

// ---------- Authors & series (derived from the books, nothing extra stored) ----------

const nameKey = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

// "Ilona Andrews, Gordon Andrews" or "A & B" -> each author gets the book on their page.
export function authorNames(book) {
    return [...new Set((book.author || "").split(/\s*[,&]\s*/).map((n) => n.trim()).filter(Boolean))];
}

// Book number order, then unnumbered books by title.
export function bySeriesOrder(a, b) {
    const x = a.seriesNumber ?? Infinity, y = b.seriesNumber ?? Infinity;
    return x !== y ? x - y : a.title.localeCompare(b.title);
}

function group(keysOf) {
    const map = new Map();
    for (const book of state.books) {
        for (const name of keysOf(book)) {
            const key = nameKey(name);
            if (!map.has(key)) map.set(key, { key, name, books: [] });
            map.get(key).books.push(book);
        }
    }
    return [...map.values()];
}

export function authorsList() {
    return group(authorNames);
}

export function findAuthor(name) {
    return authorsList().find((a) => a.key === nameKey(name || "")) || null;
}

export function seriesList() {
    return group((b) => (b.series ? [b.series] : [])).map(summarizeSeries);
}

export function findSeries(name) {
    return seriesList().find((s) => s.key === nameKey(name || "")) || null;
}

function summarizeSeries(series) {
    const books = [...series.books].sort(bySeriesOrder);
    const read = books.filter((b) => b.status === "Read").length;
    const inProgress = books.find((b) => b.status === "Reading" || b.status === "Paused");
    const next = inProgress || books.find((b) => b.status === "To Be Read") || null;
    const status = read === books.length ? "Completed" : read || inProgress ? "In progress" : "Not started";
    const authors = [...new Set(books.flatMap(authorNames))];
    return { ...series, books, read, next, status, authors, percent: Math.round((read / books.length) * 100) };
}

export function seriesNames() {
    return seriesList().map((s) => s.name).sort((a, b) => a.localeCompare(b));
}
