import type { Book, CustomGoal } from "../api/types";
import { booksFinished } from "./readingRules";
import { dayString } from "./dates";

export const GOAL_FILTER_LABELS = { genre: "Genre", format: "Format", age: "Age category" } as const;

function matchesGoalFilter(book: Book, goal: CustomGoal): boolean {
    const v = (goal.filterValue || "").toLowerCase();
    if (goal.filterType === "genre") return [...book.genres, ...book.subgenres].some((g) => g.toLowerCase() === v);
    if (goal.filterType === "format") return (book.format || "").toLowerCase() === v;
    if (goal.filterType === "age") return (book.ageCategory || "").toLowerCase() === v;
    return true;
}

// Counts finished books (or their pages) in the current month/year that match the goal's filter.
export function goalProgress(books: Book[], goal: CustomGoal, now = new Date()) {
    const year = now.getFullYear();
    const matching = booksFinished(books, goal.period === "month" ? { year, month: now.getMonth() + 1 } : { year })
        .filter((b) => matchesGoalFilter(b, goal));
    const done = goal.metric === "pages" ? matching.reduce((s, b) => s + (b.totalPages || 0), 0) : matching.length;
    return { done, books: matching, percent: Math.min(100, Math.round((done / goal.target) * 100)) };
}

// "12 Classics books this year" when the goal has no name of its own.
export function goalTitle(goal: CustomGoal): string {
    if (goal.title) return goal.title;
    const what = goal.metric === "pages" ? "pages" : "books";
    const filter = goal.filterValue ? ` ${goal.filterValue}` : "";
    return `${goal.target.toLocaleString()}${filter} ${what} this ${goal.period}`;
}

// ---------- Reading streak (from the days with a logged session) ----------

// The days that make up the current streak, newest first. If today has no entry yet,
// the streak that ended yesterday still counts.
export function streakRun(readingDays: Iterable<string>, now = new Date()): string[] {
    const days = new Set(readingDays);
    const d = new Date(now);
    if (!days.has(dayString(d))) d.setDate(d.getDate() - 1);
    const run: string[] = [];
    while (days.has(dayString(d))) {
        run.push(dayString(d));
        d.setDate(d.getDate() - 1);
    }
    return run;
}

export const readingStreak = (readingDays: Iterable<string>, now = new Date()) => streakRun(readingDays, now).length;
