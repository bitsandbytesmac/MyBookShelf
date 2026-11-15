// Central app state. Views subscribe and re-render on change.
import { api } from "./api.js";
import { challengeProgress as progressOf, spotDone } from "./challengeMatch.js";

export const STATUSES = ["To Be Read", "Reading", "Read", "Paused", "DNF"];
export const FORMATS = ["Paperback", "Hardbound", "E-book", "Audiobook"];
export const OWNERSHIP = ["Owned", "Borrowed", "Gifted"];
export const AGE_CATEGORIES = ["Children", "Middle Grade", "Young Adult", "New Adult", "Adult"];

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

export const TROPES = [
    "Enemies to Lovers", "Friends to Lovers", "Rivals to Lovers", "Slow Burn", "Forced Proximity",
    "Only One Bed", "Fake Dating", "Marriage of Convenience", "Second Chance", "Grumpy x Sunshine",
    "Forbidden Love", "Love Triangle", "Found Family", "Chosen One", "Morally Grey",
    "Who Did This to You", "Touch Her and Die", "Secret Identity", "Redemption Arc", "Academy / Magic School",
    "Heist", "Quest", "Small Town", "Dual POV", "Unreliable Narrator", "Time Travel"
];

export const CONTENT_WARNINGS = [
    "Death", "Death of a parent", "Grief", "Violence", "Gore", "Torture", "War", "Kidnapping",
    "Sexual content", "Sexual assault", "Abuse", "Domestic abuse", "Child abuse", "Self-harm", "Suicide",
    "Mental illness", "Addiction", "Eating disorder", "Terminal illness", "Pregnancy loss",
    "Animal death", "Cheating", "Racism", "Homophobia"
];

// Suggestions for the tags the challenge matcher reads. Readers can add their own.
export const THEMES = [
    "Friendship", "Family", "Grief", "Love", "Revenge", "Redemption", "Identity", "Coming of age",
    "Survival", "Power", "War", "Magic", "Mental health", "Found family", "Second chances", "Self-discovery",
    "Betrayal", "Justice", "Hope", "Books about books"
];
export const SETTINGS = [
    "Small town", "Big city", "Boarding school", "University", "Royal court", "Castle", "Space", "Island",
    "By the sea", "Forest", "Desert", "Mountains", "Winter", "Paris", "London", "New York", "Japan",
    "Victorian England", "Regency era", "World War II", "Future", "Fantasy world", "Bookshop"
];
export const CHARACTERS = [
    "Female lead", "Male lead", "Morally grey", "Villain lead", "Anti-hero", "Royalty", "Witch",
    "Detective", "Assassin", "Dragon rider", "Artist", "Doctor", "Twins", "Siblings", "Queer lead",
    "BIPOC lead", "Disabled lead", "Older protagonist", "Child narrator", "Multiple POV", "Unreliable narrator"
];

const listeners = new Set();

export const state = {
    books: [],
    activities: [],
    statistics: null,
    goals: { monthlyGoal: 2, yearlyGoal: 12 },
    customGoals: [],
    challenges: [],
    nextUp: [],          // book ids picked for "Next Up" (max 3)
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

// Every genre/sub-genre/trope/content warning in use, plus the defaults.
const DEFAULT_OPTIONS = {
    genres: GENRES, subgenres: SUBGENRES, tropes: TROPES, contentWarnings: CONTENT_WARNINGS,
    themes: THEMES, settings: SETTINGS, characters: CHARACTERS
};
export function genreOptions(kind = "genres") {
    const defaults = DEFAULT_OPTIONS[kind];
    const used = state.books.flatMap((b) => b[kind] || []);
    return [...new Set([...defaults, ...used])];
}

// ---------- Loading ----------

export async function loadAll() {
    const [books, goals, customGoals, challenges, nextUp] = await Promise.all([
        api.getBooks(),
        api.getGoals().catch(() => null),
        api.getCustomGoals().catch(() => []),
        api.getChallenges().catch(() => []),
        api.getNextUp().catch(() => []),
        refreshActivity({ silent: true })
    ]);
    state.nextUp = nextUp;
    // The nav's "Add book" works before this finishes; on a slow connection a book can be saved while
    // the list was still on its way. That response predates it, so keep it instead of dropping it.
    const fetched = new Set(books.map((b) => b.id));
    state.books = [...state.books.filter((b) => !fetched.has(b.id)), ...books];
    if (goals) state.goals = goals;
    state.customGoals = customGoals;
    state.challenges = challenges;
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

// The server copies a book's series total to the rest of its series; mirror that locally.
function syncSeriesTotal(saved) {
    if (!saved.series) return;
    const key = nameKey(saved.series);
    for (const b of state.books) if (b.series && nameKey(b.series) === key) b.seriesTotal = saved.seriesTotal;
}

export async function createBook(data) {
    const book = {
        status: "To Be Read", genres: [], subgenres: [], tropes: [], contentWarnings: [], themes: [], settings: [], characters: [],
        quotes: [], isFavorite: false, ...data
    };
    // A new book joins its series' existing total instead of clearing it.
    if (book.series && book.seriesTotal == null) book.seriesTotal = findSeries(book.series)?.total ?? null;

    const saved = await api.createBook(applyReadingRules(book));
    state.books.unshift(saved);
    syncSeriesTotal(saved);
    emit();
    if (saved.status === "Read") notifyFinished(saved);
    return saved;
}

// session (optional): { date, note } - saves a "Log your reading" journal entry along with the change.
export async function updateBook(id, changes, { session = null } = {}) {
    const current = getBook(id);
    if (!current) throw new Error("Book not found.");

    const previousPage = current.currentPage;
    const wasRead = current.status === "Read";
    const next = applyReadingRules({ ...current, ...changes }, current);
    const saved = await api.updateBook(id, next, session);
    Object.assign(current, saved);
    syncSeriesTotal(saved);

    // The server logs a reading session whenever the page count goes up.
    if (saved.currentPage > previousPage || session?.note) await refreshActivity({ silent: true });

    emit();
    if (!wasRead && current.status === "Read") notifyFinished(current);
    return current;
}

export async function deleteBook(id) {
    await api.deleteBook(id);
    state.books = state.books.filter((book) => book.id !== String(id));
    // The server freed this book's challenge spots; mirror that.
    for (const c of state.challenges) {
        c.items = c.items.map((it) => (it.bookId === String(id) ? { ...it, bookId: null, assignedAt: undefined } : it));
    }
    // Its journal entries were deleted too: drop them now, then reload the streak days and page totals.
    state.activities = state.activities.filter((a) => String(a.book_id) !== String(id));
    emit();
    await refreshActivity();
}

// "A book was just finished": the challenge module listens so it can offer the spots the book unlocks.
const finishedListeners = new Set();
export function onBookFinished(fn) {
    finishedListeners.add(fn);
    return () => finishedListeners.delete(fn);
}
function notifyFinished(book) {
    // After the current toast/dialog has settled.
    setTimeout(() => finishedListeners.forEach((fn) => fn(book)), 0);
}

export async function saveGoals(goals) {
    state.goals = await api.updateGoals(goals);
    emit();
}

export async function saveCustomGoal(goal, id = null) {
    if (id) {
        const saved = await api.updateCustomGoal(id, goal);
        state.customGoals = state.customGoals.map((g) => (g.id === id ? saved : g));
    } else {
        state.customGoals.push(await api.createCustomGoal(goal));
    }
    emit();
}

export async function deleteCustomGoal(id) {
    await api.deleteCustomGoal(id);
    state.customGoals = state.customGoals.filter((g) => g.id !== id);
    emit();
}

// ---------- Challenges ----------

export function getChallenge(id) {
    return state.challenges.find((c) => c.id === String(id));
}

export async function createChallenge(data) {
    const saved = await api.createChallenge(data);
    state.challenges.unshift(saved);
    emit();
    return saved;
}

export async function updateChallenge(id, changes) {
    const current = getChallenge(id);
    if (!current) throw new Error("Challenge not found.");
    Object.assign(current, await api.updateChallenge(id, { ...current, ...changes }));
    emit();
    return current;
}

export async function deleteChallenge(id) {
    await api.deleteChallenge(id);
    state.challenges = state.challenges.filter((c) => c.id !== String(id));
    emit();
}

// A spot counts once its book is finished (see challengeMatch.js for every matching rule).
export function challengeItemDone(item) {
    return spotDone(item, state.books);
}

export function challengeProgress(challenge) {
    return progressOf(challenge, state.books);
}

// Put a book on a spot (or several spots of one challenge) in a single save.
export async function assignSpots(challengeId, assignments) {
    const challenge = getChallenge(challengeId);
    if (!challenge) throw new Error("Challenge not found.");
    const now = new Date().toISOString();
    const items = challenge.items.map((it, i) => {
        if (!(i in assignments)) return it;
        const bookId = assignments[i];
        const { assignedAt, ...rest } = it;
        void assignedAt;
        return bookId ? { ...rest, bookId, assignedAt: now } : { ...rest, bookId: null, done: false };
    });
    return updateChallenge(challengeId, { items });
}

// ---------- Derived ----------

// ---------- Next Up ----------

export const NEXT_UP_MAX = 3;

// The picked books that are still To Be Read (once started, a book leaves Next Up by itself).
export function nextUpBooks() {
    return state.nextUp.map(getBook).filter((b) => b && b.status === "To Be Read");
}

export async function saveNextUp(bookIds) {
    state.nextUp = await api.updateNextUp(bookIds.slice(0, NEXT_UP_MAX));
    emit();
}

// ---------- Reading streak (from the days with a logged session) ----------

function dayString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function readingDays() {
    return new Set(state.statistics?.readingDays || []);
}

// Consecutive days with a session, ending today. If today has none yet, the streak from yesterday still counts.
export function readingStreak(days = readingDays()) {
    const d = new Date();
    if (!days.has(dayString(d))) d.setDate(d.getDate() - 1);
    let streak = 0;
    while (days.has(dayString(d))) {
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

export function booksFinished({ year, month } = {}) {
    return state.books.filter((b) => {
        if (b.status !== "Read" || !b.dateFinished) return false;
        const [y, m] = b.dateFinished.split("-").map(Number);
        return (year === undefined || y === year) && (month === undefined || m === month);
    });
}

// ---------- Custom goal progress ----------

export const GOAL_FILTER_LABELS = { genre: "Genre", format: "Format", age: "Age category" };

function matchesGoalFilter(book, goal) {
    const v = (goal.filterValue || "").toLowerCase();
    if (goal.filterType === "genre") return [...book.genres, ...book.subgenres].some((g) => g.toLowerCase() === v);
    if (goal.filterType === "format") return (book.format || "").toLowerCase() === v;
    if (goal.filterType === "age") return (book.ageCategory || "").toLowerCase() === v;
    return true;
}

// Counts finished books (or their pages) in the current month/year that match the goal's filter.
export function goalProgress(goal) {
    const now = new Date();
    const year = now.getFullYear();
    const books = booksFinished(goal.period === "month" ? { year, month: now.getMonth() + 1 } : { year })
        .filter((b) => matchesGoalFilter(b, goal));
    const done = goal.metric === "pages" ? books.reduce((s, b) => s + (b.totalPages || 0), 0) : books.length;
    return { done, books, percent: Math.min(100, Math.round((done / goal.target) * 100)) };
}

// "12 Classics books this year" when the goal has no name of its own.
export function goalTitle(goal) {
    if (goal.title) return goal.title;
    const what = goal.metric === "pages" ? "pages" : "books";
    const filter = goal.filterValue ? ` ${goal.filterValue}` : "";
    return `${goal.target.toLocaleString()}${filter} ${what} this ${goal.period}`;
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

// total: the "Books in series" the reader entered (null if never set). outOf: total, else the books on the shelf.
// With a total set, novellas (1.5, 2.5...) don't count toward it, so "3 of 3" means the main books.
function summarizeSeries(series) {
    const books = [...series.books].sort(bySeriesOrder);
    const total = Math.max(0, ...books.map((b) => b.seriesTotal || 0)) || null;
    const finished = books.filter((b) => b.status === "Read");
    const counted = total ? finished.filter((b) => b.seriesNumber == null || Number.isInteger(b.seriesNumber)) : finished;
    const outOf = total || books.length;
    const read = Math.min(counted.length, outOf);
    const inProgress = books.find((b) => b.status === "Reading" || b.status === "Paused");
    const next = inProgress || books.find((b) => b.status === "To Be Read") || null;
    const status = read >= outOf ? "Completed" : finished.length || inProgress ? "In progress" : "Not started";
    const authors = [...new Set(books.flatMap(authorNames))];
    return { ...series, books, read, total, outOf, next, status, authors, percent: Math.round((read / outOf) * 100) };
}

export function seriesNames() {
    return seriesList().map((s) => s.name).sort((a, b) => a.localeCompare(b));
}
