// Unit tests for the challenge matcher (client/src/domain/challengeMatch.ts). No browser needed: the module is pure.
import { test, expect } from "@playwright/test";
import type { Challenge } from "../client/src/api/types";
import {
    matchSpot, describeCriteria, challengeProgress, challengeState, spotsForBook, suggestionsForSpot,
    proposeFills, unlocksForFinishedBook, inWindow, searchQueryForSpot, type MatchBook
} from "../client/src/domain/challengeMatch";

type B = MatchBook;
const book = (o: Partial<B> & { id: string; title: string }): B => ({
    author: "Ann Writer", summary: "", status: "To Be Read", genres: [], subgenres: [], tropes: [], themes: [], characters: [], setting: "",
    totalPages: 0, publishedYear: null, dateFinished: null, ageDemos: [], format: "", ...o
});
const TODAY = "2026-11-15";

test.describe("matchSpot", () => {
    test("confirmed when the book's own tags meet every rule", () => {
        const b = book({ id: "1", title: "Fourth Wing", genres: ["Fantasy"], subgenres: ["Romantasy"], tropes: ["Enemies to Lovers"], setting: "A magic academy" });
        const m = matchSpot(b, { genres: ["Romantasy"], tropes: ["Enemies to Lovers", "Fake Dating"] });
        expect(m.status).toBe("confirmed");
        expect(m.reasons.map((r: { text: string }) => r.text)).toEqual(["Genre: Romantasy", "Trope: Enemies to Lovers"]);
    });

    test("a broader wanted tag is met by a more specific tag, not the other way round", () => {
        expect(matchSpot(book({ id: "1", title: "X", subgenres: ["Dark Romance"] }), { genres: ["Romance"] }).status).toBe("confirmed");
        expect(matchSpot(book({ id: "1", title: "X", genres: ["Romance"] }), { genres: ["Dark Romance"] }).status).toBe("none");
    });

    test("only the summary mentioning it is a POSSIBLE match, never confirmed", () => {
        const b = book({ id: "1", title: "Sea Song", summary: "A lonely girl befriends the dragons of the northern isles." });
        const m = matchSpot(b, { themes: ["dragon"] });
        expect(m.status).toBe("possible");
        expect(m.reasons[0]).toEqual({ text: "Theme “dragon” is mentioned in the summary", confirmed: false });
    });

    test("a keyword in the title is a confirmed fact", () => {
        expect(matchSpot(book({ id: "1", title: "The Dragon Republic" }), { themes: ["dragon"] }).status).toBe("confirmed");
    });

    test("every rule must hold: one missing rule means no match", () => {
        const b = book({ id: "1", title: "Emma", genres: ["Classics"], totalPages: 300 });
        const m = matchSpot(b, { genres: ["Classics"], minPages: 400 });
        expect(m.status).toBe("none");
        expect(m.missing).toEqual(["400+ pages"]);
    });

    test("title rules ignore a leading 'The/A/An' by default", () => {
        const b = book({ id: "1", title: "The Hobbit" });
        expect(matchSpot(b, { title: { mode: "startsWith", value: "H" } }).status).toBe("confirmed");
        expect(matchSpot(b, { title: { mode: "startsWith", value: "T" } }).status).toBe("confirmed");
        expect(matchSpot(b, { title: { mode: "startsWith", value: "H", ignoreArticles: false } }).status).toBe("none");
        expect(matchSpot(b, { title: { mode: "contains", value: "obbi" } }).status).toBe("confirmed");
    });

    test("unknown facts never count (no page count, no year)", () => {
        const b = book({ id: "1", title: "Mystery Book" });
        expect(matchSpot(b, { minPages: 100 }).missing).toEqual(["100+ pages (page count unknown)"]);
        expect(matchSpot(b, { yearFrom: 2000 }).missing).toEqual(["Published 2000 or later (year unknown)"]);
        expect(matchSpot({ ...b, publishedYear: 2015 }, { yearFrom: 2000, yearTo: 2020 }).status).toBe("confirmed");
    });

    test("author, age and format", () => {
        const b = book({ id: "1", title: "X", author: "Brandon Sanderson", ageDemos: ["Young Adult", "Adult"], format: "Audiobook" });
        expect(matchSpot(b, { author: "sanderson", ageCategory: ["Adult", "New Adult"], format: ["Audiobook"] }).status).toBe("confirmed");
        expect(matchSpot(b, { format: ["Paperback"] }).status).toBe("none");
    });

    test("a spot with no rules is chosen by hand", () => {
        expect(matchSpot(book({ id: "1", title: "Red" }), {}).status).toBe("manual");
        expect(matchSpot(book({ id: "1", title: "Red" }), undefined).status).toBe("manual");
        expect(describeCriteria({})).toEqual([]);
        expect(describeCriteria({ genres: ["Fantasy"], minPages: 400, title: { mode: "startsWith", value: "A" } }))
            .toEqual(["Genre: Fantasy", "Title starts with “A”", "400+ pages"]);
    });
});

test.describe("challenge progress and discovery", () => {
    const books = [
        book({ id: "r1", title: "Read Fantasy", genres: ["Fantasy"], status: "Read", dateFinished: "2026-03-01" }),
        book({ id: "r2", title: "Old Fantasy", genres: ["Fantasy"], status: "Read", dateFinished: "2025-06-01" }),
        book({ id: "t1", title: "TBR Fantasy", genres: ["Fantasy"] }),
        book({ id: "p1", title: "Maybe", summary: "A fantasy adventure." }),
        book({ id: "m1", title: "Mystery Read", genres: ["Mystery"], status: "Read", dateFinished: "2026-04-01" })
    ];
    const challenge: Challenge = {
        id: "c1", name: "Genres", description: "", startsOn: "2026-01-01", endsOn: "2026-12-31", autoMatch: true,
        items: [
            { label: "Fantasy", bookId: null, criteria: { genres: ["Fantasy"] } },
            { label: "Mystery", bookId: null, criteria: { genres: ["Mystery"] } },
            { label: "Red cover", bookId: null }
        ]
    };

    test("only finished books count toward progress", () => {
        const c = { ...challenge, items: [{ ...challenge.items[0], bookId: "t1" }, { ...challenge.items[1], bookId: "m1" }, challenge.items[2]] };
        expect(challengeProgress(c, books)).toEqual({ done: 1, total: 3, open: 2, percent: 33 });
        expect(challengeState(c, books, TODAY)).toBe("active");
        expect(challengeState({ ...c, startsOn: "2027-01-01", endsOn: null }, books, TODAY)).toBe("upcoming");
        expect(challengeState({ ...c, endsOn: "2026-10-01" }, books, TODAY)).toBe("ended");
    });

    test("the date window decides which finished books count automatically", () => {
        expect(inWindow(books[0], challenge)).toBe(true);
        expect(inWindow(books[1], challenge)).toBe(false); // finished in 2025
        expect(inWindow(books[1], { ...challenge, startsOn: null, endsOn: null })).toBe(true);
    });

    test("suggestions: ready (finished, confirmed, in window), planned (TBR), possible (summary only)", () => {
        const g = suggestionsForSpot(challenge, 0, books);
        expect(g.ready.map((e: { book: B }) => e.book.id)).toEqual(["r1"]);
        expect(g.planned.map((e: { book: B }) => e.book.id)).toEqual(["t1"]);
        expect(g.possible.map((e: { book: B }) => e.book.id)).toEqual(["p1"]);
        // A spot without rules suggests nothing (it's picked by hand).
        expect(suggestionsForSpot(challenge, 2, books)).toEqual({ ready: [], planned: [], possible: [] });
    });

    test("proposeFills uses confirmed finished books, each book once per challenge", () => {
        const twoFantasy = { ...challenge, items: [...challenge.items, { label: "Fantasy again", bookId: null, criteria: { genres: ["Fantasy"] } }] };
        const fills = proposeFills(twoFantasy, books).map((p: { index: number; book: B }) => [p.index, p.book.id]);
        expect(fills).toEqual([[0, "r1"], [1, "m1"]]); // r2 is outside the dates; r1 isn't reused for spot 3
    });

    test("a finished book's unlock prompt lists all its spots, pre-ticks one confirmed spot per challenge", () => {
        const other: Challenge = { id: "c2", name: "Any Fantasy", description: "", startsOn: null, endsOn: null, autoMatch: true, items: [{ label: "F", bookId: null, criteria: { genres: ["Fantasy"] } }] };
        const off = { ...other, id: "c3", autoMatch: false };
        const groups = unlocksForFinishedBook(books[0], [challenge, other, off], books, TODAY);
        expect(groups.map((g: { challenge: { id: string } }) => g.challenge.id)).toEqual(["c1", "c2"]); // auto-match off is skipped
        expect(groups[0].options.map((o: { index: number; checked: boolean }) => [o.index, o.checked])).toEqual([[0, true]]);

        // A book planned in a spot is reported as completed when finished.
        const planned = { ...challenge, items: [{ ...challenge.items[0], bookId: "r1" }, challenge.items[1], challenge.items[2]] };
        const g2 = unlocksForFinishedBook(books[0], [planned], books, TODAY);
        expect(g2[0].completed).toEqual([0]);
        expect(g2[0].options).toEqual([]);
    });

    test("spotsForBook shows spots the book fills and open spots it fits", () => {
        const c = { ...challenge, items: [{ ...challenge.items[0], bookId: "t1" }, challenge.items[1], challenge.items[2]] };
        const entries = spotsForBook(books[2], [c], books, TODAY).map((e: { index: number; filledByThis: boolean }) => [e.index, e.filledByThis]);
        expect(entries).toEqual([[0, true]]);
        expect(spotsForBook(books[4], [c], books, TODAY).map((e: { index: number }) => e.index)).toEqual([1]);
    });

    test("Google query is built from the rules", () => {
        expect(searchQueryForSpot({ label: "x", criteria: { genres: ["Fantasy"], tropes: ["Found Family"] } })).toBe("subject:Fantasy Found Family");
        expect(searchQueryForSpot({ label: "A book with a map" })).toBe("A book with a map");
    });
});
