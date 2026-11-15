// Challenges: smart reading challenges. The index is a challenge dashboard (active / upcoming / completed,
// open spots, books from your shelf that fit them, recently unlocked spots). A challenge page is a board of
// book-shaped spots; each spot has matching rules, and books fill spots automatically (see challengeMatch.js).
import { state, getBook, getChallenge, deleteChallenge, today } from "./store.js";
import {
    challengeState, challengeProgress, suggestionsForSpot, spotOpen, spotDone, matchSpot, proposeFills, hasCriteria
} from "./challengeMatch.js";
import { h, icon, cover, coverStack, progressBar, fmt, toast, confirmDialog } from "./ui.js";
import { loadingSkeleton } from "./dashboard.js";
import {
    challengeHref, openCreateChallenge, openEditChallenge, openSpot, openSpotEditor, openFillReview
} from "./challengeDialogs.js";

const view = { tab: "active" };

export function renderChallenges(params, id) {
    if (!state.loaded) return loadingSkeleton();
    return id ? challengeBoard(id) : challengeIndex();
}

// ---------- Slot colours ----------

// A prompt that names a colour ("Red", "Dark Blue", "Grey") gets that colour, like a rainbow challenge sheet.
// These are the prompt's own colours (content, not theme), so they're the same in every theme.
const PROMPT_COLOURS = [
    ["dark blue", "#a3b1ee"], ["navy", "#7f8fd6"], ["light blue", "#bfe6e6"], ["sky blue", "#bfe6e6"],
    ["light green", "#d6f2c4"], ["dark green", "#8fbf87"], ["red", "#f59b9b"], ["orange", "#f0c592"],
    ["yellow", "#f3e59e"], ["green", "#c4ecb4"], ["blue", "#a9c8f0"], ["teal", "#9fd8d0"],
    ["purple", "#d9c3ea"], ["lilac", "#d9c3ea"], ["violet", "#cbb5ea"], ["pink", "#fbd0ec"],
    ["white", "#ffffff"], ["black", "#141414"], ["brown", "#a87f69"], ["grey", "#d6d6d8"], ["gray", "#d6d6d8"],
    ["gold", "#e8cc7a"], ["silver", "#cfd3d8"], ["beige", "#eadcc2"], ["cream", "#f6efd9"]
];
const DARK_COLOURS = new Set(["#141414", "#7f8fd6"]);

export function promptColour(label) {
    const text = label.trim().toLowerCase();
    return PROMPT_COLOURS.find(([name]) => text === name || text.startsWith(`${name} `))?.[1] || null;
}

// "Jan 1 – Dec 31, 2026"
function dateRange(c) {
    if (!c.startsOn && !c.endsOn) return "No end date";
    if (!c.startsOn) return `Until ${fmt.date(c.endsOn)}`;
    if (!c.endsOn) return `From ${fmt.date(c.startsOn)}`;
    return `${fmt.date(c.startsOn)} – ${fmt.date(c.endsOn)}`;
}

const STATE_LABEL = { active: "Active", upcoming: "Upcoming", completed: "Completed", ended: "Ended" };

// ---------- The challenge dashboard ----------

function challengeIndex() {
    const day = today();
    const all = state.challenges.map((c) => ({ c, st: challengeState(c, state.books, day), p: challengeProgress(c, state.books) }));
    const by = (st) => all.filter((x) => x.st === st);
    const active = by("active");
    const totals = active.reduce((t, x) => ({ done: t.done + x.p.done, total: t.total + x.p.total }), { done: 0, total: 0 });

    const head = h("div", { class: "page-head" },
        h("div", {},
            h("h1", {}, "Challenges"),
            h("p", {}, all.length
                ? "Your challenges fill themselves as you finish books that fit."
                : "Set reading challenges and let your finished books fill them")),
        h("button", { class: "btn btn-primary", type: "button", onclick: openCreateChallenge }, icon("plus"), "New challenge"));

    if (!all.length) {
        return h("div", {}, head, h("div", { class: "card empty" },
            h("h3", {}, "No challenges yet"),
            h("p", {}, "Pick a template like Genre Explorer, A to Z or Trope Bingo, or write your own spots. "
                + "Each spot has rules, and books that fit are matched for you."),
            h("button", { class: "btn btn-primary", type: "button", onclick: openCreateChallenge }, "Create a challenge")));
    }

    const tabs = ["active", "upcoming", "completed", ...(by("ended").length ? ["ended"] : [])];
    if (!tabs.includes(view.tab)) view.tab = "active";
    const tabBar = h("div", { class: "status-tabs", role: "tablist", "aria-label": "Challenge status" },
        tabs.map((t) => h("button", {
            type: "button", role: "tab", class: view.tab === t ? "active" : "", "aria-selected": String(view.tab === t),
            onclick: () => {
                view.tab = t;
                document.getElementById("view").replaceChildren(challengeIndex());
            }
        }, STATE_LABEL[t], h("span", { class: "count" }, by(t).length))));

    const shown = by(view.tab);
    return h("div", {}, head,
        h("div", { class: "stat-summary" },
            summaryTile("Active", active.length, "challenges running"),
            summaryTile("Completed", by("completed").length, "challenges finished"),
            summaryTile("Spots filled", `${totals.done}/${totals.total}`, "in active challenges"),
            summaryTile("Open spots", totals.total - totals.done, "waiting for a book")),
        h("section", { class: "section" },
            tabBar,
            shown.length
                ? h("div", { class: "challenge-grid" }, shown.map((x) => challengeCard(x)))
                : h("div", { class: "card empty-sm" }, `No ${STATE_LABEL[view.tab].toLowerCase()} challenges.`)),
        active.length ? h("div", { class: "dash-grid section challenge-discovery" }, openSpotsCard(active.map((x) => x.c)), recommendedCard(active.map((x) => x.c))) : null,
        recentlyUnlockedSection()
    );
}

function summaryTile(label, value, sub) {
    return h("div", { class: "card dash-card dash-stat stat-tile" },
        h("span", { class: "dash-stat-label" }, label),
        h("span", { class: "dash-stat-value" }, typeof value === "number" ? fmt.num(value) : value),
        h("span", { class: "dash-stat-sub" }, sub));
}

function challengeCard({ c, st, p }) {
    const finishedBooks = c.items.filter((it) => spotDone(it, state.books) && it.bookId).map((it) => getBook(it.bookId)).filter(Boolean);
    return h("a", { class: `card challenge-card is-${st}`, href: challengeHref(c.id) },
        h("div", { class: "challenge-card-title" },
            h("h3", {}, c.name),
            st === "completed" ? h("span", { class: "badge st-read" }, icon("check"), "Completed")
                : st === "upcoming" ? h("span", { class: "badge st-tbr" }, "Upcoming")
                    : st === "ended" ? h("span", { class: "badge st-dnf" }, "Ended") : null),
        h("p", { class: "challenge-dates" }, dateRange(c)),
        c.description ? h("p", { class: "sub" }, c.description) : null,
        finishedBooks.length ? coverStack(finishedBooks, 6) : null,
        h("div", { class: "series-progress" },
            progressBar(p.percent, { thin: true }),
            h("small", {}, `${p.done}/${p.total} spots · ${p.percent}%`)));
}

// Open spots across active challenges, with how many books on the shelf fit each.
function openSpotsCard(challenges) {
    const rows = [];
    for (const c of challenges) {
        c.items.forEach((item, index) => {
            if (!spotOpen(item, state.books)) return;
            const g = suggestionsForSpot(c, index, state.books);
            rows.push({ c, item, index, ready: g.ready.length, planned: g.planned.length + (item.bookId ? 1 : 0), possible: g.possible.length });
        });
    }
    rows.sort((a, b) => b.ready - a.ready || b.planned - a.planned || b.possible - a.possible);

    return h("section", { class: "card dash-card", "aria-labelledby": "openSpotsTitle" },
        h("div", { class: "dash-card-head" }, h("h2", { id: "openSpotsTitle" }, "Unfilled spots"), h("span", { class: "hint" }, fmt.plural(rows.length, "spot"))),
        rows.length
            ? h("ul", { class: "open-spots" }, rows.slice(0, 8).map((r) => h("li", {},
                h("button", { type: "button", class: "open-spot", onclick: () => openSpot(r.c.id, r.index) },
                    h("span", { class: "open-spot-text" }, h("strong", {}, r.item.label), h("small", {}, r.c.name)),
                    h("span", { class: "open-spot-counts" },
                        r.ready ? h("span", { class: "count-chip is-ready" }, `${r.ready} ready`) : null,
                        r.planned ? h("span", { class: "count-chip" }, `${r.planned} on TBR`) : null,
                        r.possible ? h("span", { class: "count-chip is-possible" }, `${r.possible} possible`) : null,
                        !r.ready && !r.planned && !r.possible ? h("span", { class: "count-chip is-none" }, hasCriteria(r.item.criteria) ? "find books" : "pick a book") : null),
                    icon("arrow")))))
            : h("p", { class: "dash-empty" }, "Every spot is filled. 🎉"));
}

// Books on the TBR / reading now that would fill the most open spots.
function recommendedCard(challenges) {
    const fits = new Map(); // bookId -> { book, spots: [{c, item, index, match}] }
    for (const c of challenges) {
        const used = new Set(c.items.map((it) => it.bookId).filter(Boolean));
        c.items.forEach((item, index) => {
            if (!spotOpen(item, state.books) || item.bookId || !hasCriteria(item.criteria)) return;
            for (const book of state.books) {
                if (book.status === "Read" || book.status === "DNF" || used.has(book.id)) continue;
                const match = matchSpot(book, item.criteria);
                if (match.status !== "confirmed") continue;
                if (!fits.has(book.id)) fits.set(book.id, { book, spots: [] });
                fits.get(book.id).spots.push({ c, item, index, match });
            }
        });
    }
    const list = [...fits.values()].sort((a, b) => b.spots.length - a.spots.length || a.book.title.localeCompare(b.book.title)).slice(0, 5);

    return h("section", { class: "card dash-card", "aria-labelledby": "recoTitle" },
        h("div", { class: "dash-card-head" }, h("h2", { id: "recoTitle" }, "Recommended from your shelf")),
        list.length
            ? h("ul", { class: "reco-list" }, list.map(({ book, spots }) => h("li", {},
                h("a", { class: "reco", href: `#/book/${book.id}` },
                    cover(book, "sm"),
                    h("span", { class: "reco-text" },
                        h("strong", {}, book.title),
                        h("small", {}, `${book.status} · fits ${fmt.plural(spots.length, "spot")}`),
                        h("span", { class: "reason-chips" }, spots.slice(0, 3).map((s) => h("span", { class: "reason-chip" }, `${s.c.name}: ${s.item.label}`))))))))
            : h("p", { class: "dash-empty" }, "None of your TBR books fits an open spot yet. Open a spot to find new ideas."));
}

// Spots filled most recently with a finished book.
function recentlyUnlockedSection() {
    const unlocked = [];
    for (const c of state.challenges) {
        for (const item of c.items) {
            const book = item.bookId ? getBook(item.bookId) : null;
            if (!book || book.status !== "Read") continue;
            const when = [item.assignedAt?.slice(0, 10), book.dateFinished].filter(Boolean).sort().pop() || "";
            unlocked.push({ c, item, book, when });
        }
    }
    unlocked.sort((a, b) => b.when.localeCompare(a.when));
    if (!unlocked.length) return null;

    return h("section", { class: "section" },
        h("div", { class: "section-head" }, h("h2", {}, "Recently unlocked")),
        h("ul", { class: "unlocked-list" }, unlocked.slice(0, 6).map((u) => h("li", {},
            h("a", { class: "unlocked", href: challengeHref(u.c.id) },
                cover(u.book, "sm"),
                h("span", { class: "unlocked-check", "aria-hidden": "true" }, icon("check")),
                h("span", { class: "unlocked-text" },
                    h("strong", {}, u.item.label),
                    h("small", {}, u.c.name),
                    h("small", {}, u.book.title, u.when ? ` · ${fmt.date(u.when)}` : "")))))));
}

// ---------- One challenge: the board ----------

function challengeBoard(id) {
    const challenge = getChallenge(id);
    const back = h("a", { class: "back-link", href: "#/challenges" }, icon("back"), "Challenges");

    if (!challenge) {
        return h("div", {}, back, h("div", { class: "card empty" },
            h("h3", {}, "Challenge not found"),
            h("p", {}, "It may have been deleted."),
            h("a", { class: "btn", href: "#/challenges" }, "All challenges")));
    }

    const p = challengeProgress(challenge, state.books);
    const st = challengeState(challenge, state.books, today());
    const fills = proposeFills(challenge, state.books).length;

    return h("div", {},
        back,
        h("section", { class: "card challenge-board" },
            h("div", { class: "board-tools" },
                h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => openEditChallenge(challenge) }, icon("edit"), "Edit"),
                h("button", {
                    class: "icon-btn", type: "button", "aria-label": "Delete challenge", title: "Delete",
                    onclick: async () => {
                        const ok = await confirmDialog({ title: "Delete this challenge?", text: `"${challenge.name}" and its spots will be removed. Your books aren't affected.` });
                        if (!ok) return;
                        try {
                            await deleteChallenge(challenge.id);
                            location.hash = "#/challenges";
                            toast("Challenge deleted");
                        } catch (error) {
                            toast(error.message, { error: true });
                        }
                    }
                }, icon("trash"))),
            h("h1", { class: "board-title" }, challenge.name),
            challenge.description ? h("p", { class: "board-kind" }, challenge.description) : null,
            h("p", { class: "board-dates" },
                dateRange(challenge), " · ", STATE_LABEL[st],
                challenge.autoMatch === false ? " · automatic matching off" : ""),
            h("div", { class: "board-progress" },
                progressBar(p.percent),
                h("span", { class: "board-count" }, `${p.done}/${p.total} · ${p.percent}%`)),
            st === "completed" ? h("p", { class: "board-done" }, "Challenge complete! 🎉") : null,
            fills ? h("button", { type: "button", class: "btn btn-sage board-fill", onclick: () => openFillReview(challenge.id) },
                icon("check"), `${fmt.plural(fills, "spot")} can be filled from books you've read`) : null,
            h("ol", { class: "board-slots" },
                challenge.items.map((item, i) => slot(challenge, item, i)),
                h("li", { class: "board-slot" },
                    h("span", { class: "slot-label", "aria-hidden": "true" }, "New spot"),
                    h("button", { type: "button", class: "slot-btn", "aria-label": "Add a spot", onclick: () => openSpotEditor(challenge.id, null) },
                        h("span", { class: "slot-box slot-add" }, h("span", { class: "slot-plus is-on" }, icon("plus"))))))
        )
    );
}

function slot(challenge, item, index) {
    const book = item.bookId ? getBook(item.bookId) : null;
    const done = spotDone(item, state.books);
    const colour = promptColour(item.label);
    const g = done ? null : suggestionsForSpot(challenge, index, state.books);
    const hint = !done && !book && g
        ? g.ready.length ? { cls: "is-ready", text: `${g.ready.length} ready` }
            : g.planned.length ? { cls: "", text: `${g.planned.length} on TBR` }
                : g.possible.length ? { cls: "is-possible", text: `${g.possible.length} possible` } : null
        : null;

    const art = book ? cover(book, "md") : h("span", { class: "slot-empty" }, h("span", { class: "slot-plus" }, icon("plus")));
    const box = h("span", { class: "slot-box", style: !book && colour ? { background: colour } : null }, art,
        done ? h("span", { class: "slot-check", "aria-hidden": "true" }, icon("check")) : null,
        book && !done ? h("span", { class: "slot-status" }, `Planned · ${book.status}`) : null,
        hint ? h("span", { class: `slot-hint ${hint.cls}` }, hint.text) : null);
    if (!book && !colour) box.classList.add(`slot-tint-${index % 3}`);
    if (!book && colour && DARK_COLOURS.has(colour)) box.classList.add("is-dark");

    const name = [item.label, book ? book.title : "no book yet", done ? "done" : book ? "planned" : null, hint?.text].filter(Boolean).join(", ");
    return h("li", { class: `board-slot${done ? " is-done" : ""}` },
        h("span", { class: "slot-label", "aria-hidden": "true" }, item.label),
        h("button", { type: "button", class: "slot-btn", "aria-label": name, onclick: () => openSpot(challenge.id, index) }, box),
        book ? h("span", { class: "slot-title" }, book.title) : h("span", { class: "slot-rules" }, ruleSummary(item))
    );
}

// One short line under an empty slot: whether books are matched for you or picked by hand.
function ruleSummary(item) {
    return hasCriteria(item.criteria) ? "Matched for you" : "You pick";
}
