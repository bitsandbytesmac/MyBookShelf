// Central app state (same data and mutations as public/js/store.js).
// State is replaced, never mutated, so React sees every change: each mutation builds a new
// object for what changed and keeps the rest, and components re-render only for the slices they read.
import { api } from "../api";
import type { Activity, Book, Challenge, ChallengeItem, CustomGoal, Goals, HiddenTags, NewBook, Session, Statistics } from "../api/types";
import type { TagKind } from "../domain/constants";
import { applyReadingRules } from "../domain/readingRules";
import { findSeries, nameKey } from "../domain/shelf";
import { NEXT_UP_MAX } from "../domain/constants";

export type AppState = {
    books: Book[];
    activities: Activity[];
    statistics: Statistics | null;
    activityVersion: number;   // bumped whenever the journal is re-fetched (the Reading Recap drops its cache)
    goals: Goals;
    customGoals: CustomGoal[];
    challenges: Challenge[];
    nextUp: string[];          // book ids picked for "Next Up" (max 3)
    hiddenTags: HiddenTags;    // categories the reader deleted from her lists of choices
    loaded: boolean;
    loadError: string | null;
};

let state: AppState = {
    books: [],
    activities: [],
    statistics: null,
    activityVersion: 0,
    goals: { monthlyGoal: 2, yearlyGoal: 12 },
    customGoals: [],
    challenges: [],
    nextUp: [],
    hiddenTags: { genres: [], subgenres: [], tropes: [], contentWarnings: [] },
    loaded: false,
    loadError: null
};

const listeners = new Set<() => void>();

export const getState = () => state;

export function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

function setState(patch: Partial<AppState>) {
    state = { ...state, ...patch };
    listeners.forEach((fn) => fn());
}

export const getBook = (id: string | number) => state.books.find((book) => book.id === String(id));
export const getChallenge = (id: string | number) => state.challenges.find((c) => c.id === String(id));

// ---------- Loading ----------

export async function loadAll() {
    try {
        const [books, goals, customGoals, challenges, nextUp, hiddenTags, activity] = await Promise.all([
            api.getBooks(),
            api.getGoals().catch(() => null),
            api.getCustomGoals().catch(() => []),
            api.getChallenges().catch(() => []),
            api.getNextUp().catch(() => []),
            api.getHiddenTags().catch(() => null),
            fetchActivity()
        ]);
        // The nav's "Add book" works before this finishes; on a slow connection a book can be saved while
        // the list was still on its way. That response predates it, so keep it instead of dropping it.
        const fetched = new Set(books.map((b) => b.id));
        setState({
            books: [...state.books.filter((b) => !fetched.has(b.id)), ...books],
            goals: goals || state.goals,
            customGoals,
            challenges,
            nextUp,
            hiddenTags: hiddenTags || state.hiddenTags,
            ...(activity || {}),
            loaded: true,
            loadError: null
        });
    } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 401) return; // already on the way to the login page
        console.error(error);
        setState({ loadError: (error as Error).message || "Something went wrong." });
        throw error;
    }
}

async function fetchActivity(): Promise<Pick<AppState, "activities" | "statistics" | "activityVersion"> | null> {
    try {
        const [activities, statistics] = await Promise.all([api.getActivities(), api.getStatistics()]);
        return { activities, statistics, activityVersion: state.activityVersion + 1 };
    } catch (error) {
        console.error("Failed to load reading activity:", error);
        return null;
    }
}

export async function refreshActivity() {
    const activity = await fetchActivity();
    if (activity) setState(activity);
}

// ---------- Journal notes ----------

// Both refresh the journal, so the book page, the dashboard's recent entries, the streak and the
// Reading Recap (its cache follows activityVersion) all show the change.
export async function editEntryNote(entryId: string, note: string) {
    await api.updateEntryNote(entryId, note);
    await refreshActivity();
}

export async function deleteEntryNote(entryId: string) {
    const result = await api.deleteEntryNote(entryId);
    await refreshActivity();
    return result;
}

// ---------- Books ----------

// The server copies a book's series total to the rest of its series; mirror that locally.
function withSeriesTotal(books: Book[], saved: Book): Book[] {
    if (!saved.series) return books;
    const key = nameKey(saved.series);
    return books.map((b) => (b.series && nameKey(b.series) === key && b.seriesTotal !== saved.seriesTotal ? { ...b, seriesTotal: saved.seriesTotal } : b));
}

export async function createBook(data: NewBook): Promise<Book> {
    const book: Partial<Book> = {
        status: "To Be Read", genres: [], subgenres: [], tropes: [], contentWarnings: [], themes: [], characters: [], ageDemos: [],
        quotes: [], isFavorite: false, totalPages: 0, currentPage: 0, dateStarted: null, dateFinished: null, ...data
    };
    // A new book joins its series' existing total instead of clearing it.
    if (book.series && book.seriesTotal == null) book.seriesTotal = findSeries(state.books, book.series)?.total ?? null;

    const saved = await api.createBook(applyReadingRules(book as Book));
    setState({ books: withSeriesTotal([saved, ...state.books], saved) });
    if (saved.status === "Read") notifyFinished(saved);
    return saved;
}

// session (optional): { date, note } - saves a "Log your reading" journal entry along with the change.
export async function updateBook(id: string, changes: Partial<Book>, { session = null }: { session?: Session | null } = {}): Promise<Book> {
    const current = getBook(id);
    if (!current) throw new Error("Book not found.");

    const next = applyReadingRules({ ...current, ...changes }, current);
    const saved = await api.updateBook(id, next, session);
    setState({ books: withSeriesTotal(state.books.map((b) => (b.id === saved.id ? saved : b)), saved) });

    // The server logs a reading session whenever the page count goes up (or a note is written).
    if (saved.currentPage > current.currentPage || session?.note) await refreshActivity();

    if (current.status !== "Read" && saved.status === "Read") notifyFinished(saved);
    return saved;
}

export async function deleteBook(id: string) {
    await api.deleteBook(id);
    setState({
        books: state.books.filter((book) => book.id !== String(id)),
        // The server freed this book's challenge spots; mirror that.
        challenges: state.challenges.map((c) => c.items.some((it) => it.bookId === String(id))
            ? { ...c, items: c.items.map((it) => (it.bookId === String(id) ? { ...it, bookId: null, assignedAt: undefined } : it)) }
            : c),
        // Its journal entries were deleted too: drop them now, then reload the streak days and page totals.
        activities: state.activities.filter((a) => String(a.book_id) !== String(id))
    });
    await refreshActivity();
}

// "A book was just finished": the challenge module listens so it can offer the spots the book unlocks.
const finishedListeners = new Set<(book: Book) => void>();
export function onBookFinished(fn: (book: Book) => void) {
    finishedListeners.add(fn);
    return () => {
        finishedListeners.delete(fn);
    };
}
function notifyFinished(book: Book) {
    // After the current toast/dialog has settled.
    setTimeout(() => finishedListeners.forEach((fn) => fn(book)), 0);
}

// ---------- Goals ----------

export async function saveGoals(goals: Goals) {
    setState({ goals: await api.updateGoals(goals) });
}

export async function saveCustomGoal(goal: Omit<CustomGoal, "id">, id: string | null = null) {
    if (id) {
        const saved = await api.updateCustomGoal(id, goal);
        setState({ customGoals: state.customGoals.map((g) => (g.id === id ? saved : g)) });
    } else {
        const saved = await api.createCustomGoal(goal);
        setState({ customGoals: [...state.customGoals, saved] });
    }
}

export async function deleteCustomGoal(id: string) {
    await api.deleteCustomGoal(id);
    setState({ customGoals: state.customGoals.filter((g) => g.id !== id) });
}

// ---------- Challenges ----------

export async function createChallenge(data: Omit<Challenge, "id">): Promise<Challenge> {
    const saved = await api.createChallenge(data);
    setState({ challenges: [saved, ...state.challenges] });
    return saved;
}

export async function updateChallenge(id: string, changes: Partial<Challenge>): Promise<Challenge> {
    const current = getChallenge(id);
    if (!current) throw new Error("Challenge not found.");
    const saved = await api.updateChallenge(id, { ...current, ...changes });
    setState({ challenges: state.challenges.map((c) => (c.id === saved.id ? saved : c)) });
    return saved;
}

export async function deleteChallenge(id: string) {
    await api.deleteChallenge(id);
    setState({ challenges: state.challenges.filter((c) => c.id !== String(id)) });
}

// Put a book on a spot (or several spots of one challenge) in a single save. assignments: { index: bookId | null }.
export async function assignSpots(challengeId: string, assignments: Record<number, string | null>) {
    const challenge = getChallenge(challengeId);
    if (!challenge) throw new Error("Challenge not found.");
    const now = new Date().toISOString();
    const items = challenge.items.map((it, i): ChallengeItem => {
        if (!(i in assignments)) return it;
        const bookId = assignments[i];
        const { assignedAt: _old, ...rest } = it;
        void _old;
        return bookId ? { ...rest, bookId, assignedAt: now } : { ...rest, bookId: null, done: false };
    });
    return updateChallenge(challengeId, { items });
}

// ---------- Deleted categories ----------

// Take a category off the reader's list of choices (deleted: true), or bring it back (deleted: false).
export async function setTagDeleted(kind: TagKind, name: string, deleted: boolean) {
    const key = name.trim().toLowerCase();
    const others = state.hiddenTags[kind].filter((v) => v.toLowerCase() !== key);
    const next = { ...state.hiddenTags, [kind]: deleted ? [...others, name.trim()] : others };
    setState({ hiddenTags: await api.updateHiddenTags(next) });
}

// ---------- Next Up ----------

// The picked books that are still To Be Read (once started, a book leaves Next Up by itself).
export function nextUpBooks(s: AppState = state): Book[] {
    const byId = new Map(s.books.map((b) => [b.id, b]));
    return s.nextUp.map((id) => byId.get(String(id))).filter((b): b is Book => Boolean(b && b.status === "To Be Read"));
}

export async function saveNextUp(bookIds: string[]) {
    setState({ nextUp: await api.updateNextUp(bookIds.slice(0, NEXT_UP_MAX)) });
}
