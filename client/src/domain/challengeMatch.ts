// The challenge matcher. Pure functions with no app imports, so every part of the app (book page, finish
// prompt, challenge board, discovery) uses exactly the same rules, and they can be tested directly
// (e2e/matching.spec.ts runs the same cases against this file and public/js/challengeMatch.js).
//
// A spot's criteria is an object of rules. A book must satisfy EVERY rule that is set; inside a list
// rule (genres, tropes, themes, settings, characters, age, format) any one value is enough.
//
// Each rule is checked against the book's own tags/facts first. That gives a CONFIRMED match.
// If a list rule is only met because a word appears in the book's summary, that's a POSSIBLE match:
// it's shown with its reason but never assigned automatically (we don't assume a genre/trope/theme).
// Rules about facts (title, author, pages, year, age, format) are either met or not; an unknown
// fact (no page count, no year) never counts.
import type { Challenge, ChallengeItem, Criteria } from "../api/types";

// The parts of a book the matcher reads.
export type MatchBook = {
    id: string;
    title: string;
    author?: string;
    summary?: string;
    status?: string;
    genres?: string[];
    subgenres?: string[];
    tropes?: string[];
    themes?: string[];
    settings?: string[];
    characters?: string[];
    totalPages?: number;
    publishedYear?: number | null;
    dateFinished?: string | null;
    ageCategory?: string;
    format?: string;
};

type ListKey = "genres" | "tropes" | "themes" | "settings" | "characters";

export const LIST_RULES: { key: ListKey; label: string; tags: (b: MatchBook) => string[] }[] = [
    { key: "genres", label: "Genre", tags: (b) => [...(b.genres || []), ...(b.subgenres || [])] },
    { key: "tropes", label: "Trope", tags: (b) => b.tropes || [] },
    { key: "themes", label: "Theme", tags: (b) => b.themes || [] },
    { key: "settings", label: "Setting", tags: (b) => b.settings || [] },
    { key: "characters", label: "Character", tags: (b) => b.characters || [] }
];

export type MatchStatus = "confirmed" | "possible" | "none" | "manual";
export type Reason = { text: string; confirmed: boolean };
export type Match = { status: MatchStatus; reasons: Reason[]; missing: string[] };

const ARTICLES = /^(the|a|an)\s+/i;
const norm = (s: unknown) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole-word (or phrase) match, allowing a simple plural: "dragon" finds "dragons".
function hasWord(text: unknown, word: string): boolean {
    const w = norm(word);
    if (!w) return false;
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(w)}(s|es)?(?=$|[^\\p{L}\\p{N}])`, "iu").test(norm(text));
}

// A tag "matches" a wanted value if they're equal or the tag contains it as a word
// ("Romance" is met by "Dark Romance"; "Dark Romance" is NOT met by plain "Romance").
const tagMeets = (tag: string, wanted: string) => norm(tag) === norm(wanted) || hasWord(tag, wanted);

export function hasCriteria(criteria: Criteria | null | undefined): criteria is Criteria {
    if (!criteria) return false;
    return Object.values(criteria).some((v) => (Array.isArray(v) ? v.length : v !== null && v !== undefined && v !== ""));
}

const pagesLabel = (c: Criteria) => c.minPages && c.maxPages ? `${c.minPages}–${c.maxPages} pages`
    : c.minPages ? `${c.minPages}+ pages` : `Up to ${c.maxPages} pages`;

// "manual": the spot has no rules, so books are chosen by hand (e.g. "red cover").
export function matchSpot(book: MatchBook, criteria: Criteria | null | undefined): Match {
    if (!hasCriteria(criteria)) return { status: "manual", reasons: [], missing: [] };

    const reasons: Reason[] = [];
    const missing: string[] = [];
    const summary = [book.summary || ""].join(" ");

    for (const rule of LIST_RULES) {
        const wanted = criteria[rule.key];
        if (!wanted?.length) continue;
        const tags = rule.tags(book);
        let hit: Reason | null = null;
        for (const w of wanted) {
            const tag = tags.find((t) => tagMeets(t, w));
            if (tag) { hit = { text: `${rule.label}: ${tag}`, confirmed: true }; break; }
        }
        // Themes/keywords also count when the title itself says so (a fact, so confirmed).
        if (!hit && rule.key === "themes") {
            const w = wanted.find((x) => hasWord(book.title, x));
            if (w) hit = { text: `Keyword “${w}” in the title`, confirmed: true };
        }
        if (!hit) {
            const w = wanted.find((x) => hasWord(summary, x));
            if (w) hit = { text: `${rule.label} “${w}” is mentioned in the summary`, confirmed: false };
        }
        if (hit) reasons.push(hit);
        else missing.push(`${rule.label}: ${wanted.join(" or ")}`);
    }

    if (criteria.title?.value) {
        const value = norm(criteria.title.value);
        const title = norm(book.title);
        const bare = title.replace(ARTICLES, "");
        const ok = criteria.title.mode === "startsWith"
            ? title.startsWith(value) || (criteria.title.ignoreArticles !== false && bare.startsWith(value))
            : title.includes(value);
        if (ok) reasons.push({ text: criteria.title.mode === "startsWith" ? `Title starts with “${criteria.title.value}”` : `Title contains “${criteria.title.value}”`, confirmed: true });
        else missing.push(criteria.title.mode === "startsWith" ? `Title starting with “${criteria.title.value}”` : `Title containing “${criteria.title.value}”`);
    }

    if (criteria.author) {
        if (norm(book.author).includes(norm(criteria.author))) reasons.push({ text: `Author: ${book.author}`, confirmed: true });
        else missing.push(`Author: ${criteria.author}`);
    }

    for (const [key, label, value] of [["ageCategory", "Age", book.ageCategory], ["format", "Format", book.format]] as const) {
        const wanted = criteria[key];
        if (!wanted?.length) continue;
        if (value && wanted.includes(value)) reasons.push({ text: `${label}: ${value}`, confirmed: true });
        else missing.push(`${label}: ${wanted.join(" or ")}`);
    }

    if (criteria.minPages || criteria.maxPages) {
        const p = book.totalPages || 0;
        const label = pagesLabel(criteria);
        if (p && (!criteria.minPages || p >= criteria.minPages) && (!criteria.maxPages || p <= criteria.maxPages)) {
            reasons.push({ text: `${p} pages`, confirmed: true });
        } else missing.push(p ? label : `${label} (page count unknown)`);
    }

    if (criteria.yearFrom !== undefined || criteria.yearTo !== undefined) {
        const y = book.publishedYear;
        const label = criteria.yearFrom !== undefined && criteria.yearTo !== undefined ? `Published ${criteria.yearFrom}–${criteria.yearTo}`
            : criteria.yearFrom !== undefined ? `Published ${criteria.yearFrom} or later` : `Published ${criteria.yearTo} or earlier`;
        if (y != null && (criteria.yearFrom === undefined || y >= criteria.yearFrom) && (criteria.yearTo === undefined || y <= criteria.yearTo)) {
            reasons.push({ text: `Published ${y}`, confirmed: true });
        } else missing.push(y != null ? label : `${label} (year unknown)`);
    }

    const status: MatchStatus = missing.length ? "none" : reasons.every((r) => r.confirmed) ? "confirmed" : "possible";
    return { status, reasons, missing };
}

// Short human-readable list of a spot's rules, for chips.
export function describeCriteria(criteria: Criteria | null | undefined): string[] {
    if (!hasCriteria(criteria)) return [];
    const out: string[] = [];
    for (const rule of LIST_RULES) if (criteria[rule.key]?.length) out.push(`${rule.label}: ${criteria[rule.key]!.join(" / ")}`);
    if (criteria.title?.value) out.push(criteria.title.mode === "startsWith" ? `Title starts with “${criteria.title.value}”` : `Title contains “${criteria.title.value}”`);
    if (criteria.author) out.push(`Author: ${criteria.author}`);
    if (criteria.ageCategory?.length) out.push(`Age: ${criteria.ageCategory.join(" / ")}`);
    if (criteria.format?.length) out.push(`Format: ${criteria.format.join(" / ")}`);
    if (criteria.minPages || criteria.maxPages) out.push(pagesLabel(criteria));
    if (criteria.yearFrom !== undefined || criteria.yearTo !== undefined) {
        out.push(criteria.yearFrom !== undefined && criteria.yearTo !== undefined ? `Published ${criteria.yearFrom}–${criteria.yearTo}`
            : criteria.yearFrom !== undefined ? `Published ${criteria.yearFrom}+` : `Published before ${criteria.yearTo! + 1}`);
    }
    return out;
}

// ---------- Challenges, spots and books ----------

const byId = <B extends MatchBook>(books: B[]) => new Map(books.map((b) => [b.id, b]));

export type ChallengeState = "upcoming" | "ended" | "completed" | "active";

// "upcoming" (not started), "ended" (past its end date, not finished), "completed", or "active".
export function challengeState(challenge: Challenge, books: MatchBook[], today: string): ChallengeState {
    const p = challengeProgress(challenge, books);
    if (p.total && p.done === p.total) return "completed";
    if (challenge.startsOn && challenge.startsOn > today) return "upcoming";
    if (challenge.endsOn && challenge.endsOn < today) return "ended";
    return "active";
}

// A spot is done when its book is finished. (Older spots ticked by hand before smart challenges
// existed, with no book, still count.)
export function spotDone(item: ChallengeItem, books: MatchBook[]): boolean {
    if (item.bookId) return byId(books).get(item.bookId)?.status === "Read";
    return Boolean(item.done);
}

export function challengeProgress(challenge: Challenge, books: MatchBook[]) {
    const map = byId(books);
    const total = challenge.items.length;
    const done = challenge.items.filter((it) => (it.bookId ? map.get(it.bookId)?.status === "Read" : Boolean(it.done))).length;
    return { done, total, open: total - done, percent: total ? Math.round((done / total) * 100) : 0 };
}

// Was this finished book read inside the challenge's dates? (No window = always yes.)
export function inWindow(book: MatchBook, challenge: Pick<Challenge, "startsOn" | "endsOn">): boolean {
    if (!challenge.startsOn && !challenge.endsOn) return true;
    const d = book.dateFinished;
    if (!d) return false;
    return (!challenge.startsOn || d >= challenge.startsOn) && (!challenge.endsOn || d <= challenge.endsOn);
}

// A spot is open if nothing finished fills it yet (empty, or holding a book that's still unread).
export function spotOpen(item: ChallengeItem, books: MatchBook[]): boolean {
    return !spotDone(item, books);
}

export type SpotForBook = { challenge: Challenge; index: number; item: ChallengeItem; match: Match; filledByThis: boolean };

// Every spot (in challenges that aren't completed or over) this book matches, best first.
export function spotsForBook(book: MatchBook, challenges: Challenge[], books: MatchBook[], today: string): SpotForBook[] {
    const out: SpotForBook[] = [];
    for (const challenge of challenges) {
        const st = challengeState(challenge, books, today);
        if (st === "completed" || st === "ended") continue;
        challenge.items.forEach((item, index) => {
            if (item.bookId === book.id) {
                out.push({ challenge, index, item, match: matchSpot(book, item.criteria), filledByThis: true });
                return;
            }
            if (!spotOpen(item, books)) return;
            const match = matchSpot(book, item.criteria);
            if (match.status === "confirmed" || match.status === "possible") out.push({ challenge, index, item, match, filledByThis: false });
        });
    }
    const rank: Record<MatchStatus, number> = { confirmed: 0, possible: 1, manual: 2, none: 3 };
    return out.sort((a, b) => Number(b.filledByThis) - Number(a.filledByThis) || rank[a.match.status] - rank[b.match.status]);
}

export type Suggestion<B> = { book: B; match: Match };

// Books from the library for one spot, grouped:
//   ready    - finished, confirmed, read inside the window: can count right now
//   planned  - To Be Read / Reading / Paused, confirmed: will count once finished
//   possible - possible matches (any status), shown with reasons but never auto-assigned
// Books already used in another spot of this challenge are left out (one book, one spot per challenge).
export function suggestionsForSpot<B extends MatchBook>(challenge: Challenge, index: number, books: B[]) {
    const item = challenge.items[index];
    const used = new Set(challenge.items.filter((_, i) => i !== index).map((it) => it.bookId).filter(Boolean));
    const groups: { ready: Suggestion<B>[]; planned: Suggestion<B>[]; possible: Suggestion<B>[] } = { ready: [], planned: [], possible: [] };
    if (!hasCriteria(item.criteria)) return groups;
    for (const book of books) {
        if (book.id === item.bookId || used.has(book.id) || book.status === "DNF") continue;
        const match = matchSpot(book, item.criteria);
        if (match.status === "possible") groups.possible.push({ book, match });
        else if (match.status === "confirmed") {
            if (book.status === "Read") { if (inWindow(book, challenge)) groups.ready.push({ book, match }); }
            else groups.planned.push({ book, match });
        }
    }
    const recent = (a: Suggestion<B>, b: Suggestion<B>) => (b.book.dateFinished || "").localeCompare(a.book.dateFinished || "") || a.book.title.localeCompare(b.book.title);
    const order: Record<string, number> = { Reading: 0, Paused: 1, "To Be Read": 2 };
    groups.ready.sort(recent);
    groups.planned.sort((a, b) => (order[a.book.status || ""] - order[b.book.status || ""]) || a.book.title.localeCompare(b.book.title));
    groups.possible.sort((a, b) => a.book.title.localeCompare(b.book.title));
    return groups;
}

// Fill open spots from finished books: confirmed matches only, read inside the window, each book used
// at most once per challenge. Returns [{ index, book, match }] for the reader to review.
export function proposeFills<B extends MatchBook>(challenge: Challenge, books: B[]): { index: number; book: B; match: Match }[] {
    const used = new Set(challenge.items.map((it) => it.bookId).filter(Boolean));
    const finished = books.filter((b) => b.status === "Read" && inWindow(b, challenge))
        .sort((a, b) => (a.dateFinished || "").localeCompare(b.dateFinished || ""));
    const proposals: { index: number; book: B; match: Match }[] = [];
    challenge.items.forEach((item, index) => {
        if (!spotOpen(item, books) || !hasCriteria(item.criteria)) return;
        for (const book of finished) {
            if (used.has(book.id)) continue;
            const match = matchSpot(book, item.criteria);
            if (match.status === "confirmed") {
                proposals.push({ index, book, match });
                used.add(book.id);
                break;
            }
        }
    });
    return proposals;
}

export type UnlockOption = { index: number; item: ChallengeItem; match: Match; checked: boolean };
export type UnlockGroup = { challenge: Challenge; completed: number[]; options: UnlockOption[] };

// Spots a just-finished book can unlock, grouped by challenge, for the "you unlocked spots" prompt.
// Only challenges with auto-match on, that are running, and where the book was finished in the window.
// One spot per challenge is pre-checked (the first confirmed one) so a book isn't counted twice by accident.
export function unlocksForFinishedBook(book: MatchBook, challenges: Challenge[], books: MatchBook[], today: string): UnlockGroup[] {
    const groups: UnlockGroup[] = [];
    for (const challenge of challenges) {
        if (challenge.autoMatch === false) continue;
        const st = challengeState(challenge, books, today);
        if (st === "upcoming" || st === "ended") continue;
        const completed = challenge.items.map((it, i) => (it.bookId === book.id ? i : -1)).filter((i) => i >= 0);
        if (!inWindow(book, challenge) && !completed.length) continue;

        const options: UnlockOption[] = [];
        if (inWindow(book, challenge)) {
            challenge.items.forEach((item, index) => {
                if (item.bookId === book.id || (item.bookId && byId(books).get(item.bookId)?.status === "Read") || (!item.bookId && item.done)) return;
                const match = matchSpot(book, item.criteria);
                if (match.status === "confirmed" || match.status === "possible") options.push({ index, item, match, checked: false });
            });
        }
        if (!completed.length) {
            const first = options.find((o) => o.match.status === "confirmed");
            if (first) first.checked = true;
        }
        if (completed.length || options.length) groups.push({ challenge, completed, options });
    }
    return groups;
}

// A Google Books query that tries to meet a spot's rules (for "Find new books").
export function searchQueryForSpot(item: Pick<ChallengeItem, "label" | "criteria">): string {
    const c = item.criteria || {};
    const parts: string[] = [];
    if (c.genres?.[0]) parts.push(`subject:${c.genres[0]}`);
    for (const key of ["tropes", "themes", "settings", "characters"] as const) if (c[key]?.[0]) parts.push(c[key]![0]);
    if (c.author) parts.push(`inauthor:${c.author}`);
    if (c.title?.mode === "contains" && c.title.value) parts.push(`intitle:${c.title.value}`);
    if (!parts.length) parts.push(item.label);
    return parts.join(" ");
}
