// Challenges: reader-made reading challenges (e.g. a Rainbow or A to Z challenge).
// A challenge is shown as a board: its title, what kind of challenge it is, and one book-shaped
// slot per prompt. A slot holds a linked book's cover; it's done when ticked or when that book is Read.
// New challenges start from a book's Edit details (the "New challenge" button picks the book).
import {
    state, getBook, getChallenge, updateChallenge, deleteChallenge,
    challengeItemDone, challengeProgress, seriesList
} from "./store.js";
import { h, icon, cover, coverStack, progressBar, statusBadge, fmt, toast, modal, confirmDialog, seriesLabel } from "./ui.js";
import { loadingSkeleton } from "./dashboard.js";
import { openEditBook } from "./dialogs.js";

const challengeHref = (id) => `#/challenges/${encodeURIComponent(id)}`;

async function run(action, message) {
    try {
        await action();
        if (message) toast(message);
    } catch (error) {
        toast(error.message, { error: true });
    }
}

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

// ---------- All challenges ----------

function challengeIndex() {
    const all = state.challenges;
    const finished = all.filter((c) => { const p = challengeProgress(c); return p.total && p.done === p.total; }).length;

    return h("div", {},
        h("div", { class: "page-head" },
            h("div", {},
                h("h1", {}, "Challenges"),
                h("p", {}, all.length
                    ? `${fmt.plural(all.length, "challenge")} · ${finished} completed`
                    : "Set your own reading challenges and fill them book by book")),
            h("button", { class: "btn btn-primary", type: "button", onclick: openBookPicker }, icon("plus"), "New challenge")
        ),
        all.length
            ? h("div", { class: "challenge-grid" }, all.map(challengeCard))
            : h("div", { class: "card empty" },
                h("h3", {}, "No challenges yet"),
                h("p", {}, "Pick a book or series from your shelf, then create a challenge for it from its Edit details."),
                h("button", { class: "btn btn-primary", type: "button", onclick: openBookPicker }, "Pick a book or series"))
    );
}

function challengeCard(challenge) {
    const p = challengeProgress(challenge);
    const complete = p.total && p.done === p.total;
    return h("a", { class: "card challenge-card", href: challengeHref(challenge.id) },
        h("div", { class: "challenge-card-title" },
            h("h3", {}, challenge.name),
            complete ? h("span", { class: "badge st-read" }, "Completed") : null),
        challenge.description ? h("p", { class: "sub" }, challenge.description) : null,
        h("div", { class: "series-progress" },
            progressBar(p.percent, { thin: true }),
            h("small", {}, `${p.done}/${p.total} · ${p.percent}%`)),
        h("div", { class: "challenge-dots", "aria-hidden": "true" },
            challenge.items.slice(0, 40).map((item) => {
                const colour = promptColour(item.label);
                return h("span", { class: challengeItemDone(item) ? "on" : "", style: colour && !challengeItemDone(item) ? { background: colour, boxShadow: "inset 0 0 0 1px var(--border-strong)" } : null });
            }))
    );
}

// ---------- New challenge: pick a book or series that isn't in a challenge yet ----------

function openBookPicker() {
    const used = new Set(state.challenges.flatMap((c) => c.items.map((it) => it.bookId).filter(Boolean)));
    const books = state.books.filter((b) => !used.has(b.id)).sort((a, b) => a.title.localeCompare(b.title));
    const series = seriesList()
        .map((s) => ({ ...s, free: s.books.filter((b) => !used.has(b.id)) }))   // s.books is in reading order
        .filter((s) => s.free.length)
        .sort((a, b) => a.name.localeCompare(b.name));

    // Go to the book and open its Edit details at the Reading challenges section.
    const pick = (book) => {
        m.close();
        location.hash = `#/book/${book.id}`;
        openEditBook(getBook(book.id), { focus: "challenges" });
    };

    const search = h("input", { class: "input", type: "search", placeholder: "Search title, author or series", "aria-label": "Search books and series", autocomplete: "off" });
    const list = h("div", { class: "picker-list" });

    const render = () => {
        const q = search.value.trim().toLowerCase();
        const hit = (...values) => !q || values.some((v) => (v || "").toLowerCase().includes(q));
        const s = series.filter((x) => hit(x.name, ...x.authors));
        const b = books.filter((x) => hit(x.title, x.author, x.series));

        // replaceChildren() doesn't flatten arrays or skip nulls (h() does), so do it here.
        list.replaceChildren(...[
            s.length ? h("h3", { class: "picker-head" }, "Series") : null,
            s.map((x) => h("button", { type: "button", class: "picker-row", onclick: () => pick(x.free[0]) },
                coverStack(x.free, 3),
                h("span", { class: "picker-text" },
                    h("strong", {}, x.name),
                    h("small", {}, `${fmt.plural(x.free.length, "book")} not in a challenge · opens ${x.free[0].title}`)),
                icon("arrow"))),
            b.length ? h("h3", { class: "picker-head" }, "Books") : null,
            b.map((x) => h("button", { type: "button", class: "picker-row", onclick: () => pick(x) },
                cover(x, "xs"),
                h("span", { class: "picker-text" },
                    h("strong", {}, x.title),
                    h("small", {}, [x.author, x.series ? seriesLabel(x) : null].filter(Boolean).join(" · "))),
                icon("arrow"))),
            !s.length && !b.length
                ? h("p", { class: "empty-sm" }, !state.books.length ? "Add some books to your shelf first."
                    : !books.length ? "Every book on your shelf is already in a challenge." : "Nothing matches that search.")
                : null
        ].flat().filter(Boolean));
    };
    search.addEventListener("input", render);
    render();

    const m = modal({
        title: "New challenge",
        body: h("div", { class: "stack" },
            h("p", { class: "hint" }, "Choose a book or series that isn't in a challenge yet. Its Edit details opens so you can add it to a challenge or create a new one."),
            search,
            list),
        initialFocus: search
    });
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

    const p = challengeProgress(challenge);
    const complete = p.total && p.done === p.total;

    const newPrompt = h("input", { class: "input", placeholder: "Add a prompt, e.g. Red, or A book with a map", "aria-label": "New prompt", maxlength: 200 });
    const addForm = h("form", { class: "challenge-add" }, newPrompt, h("button", { class: "btn", type: "submit" }, icon("plus"), "Add prompt"));
    addForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const label = newPrompt.value.trim();
        if (!label) return newPrompt.focus();
        run(() => updateChallenge(challenge.id, { items: [...challenge.items, { label, bookId: null, done: false }] }), "Prompt added");
    });

    return h("div", {},
        back,
        h("section", { class: "card challenge-board" },
            h("div", { class: "board-tools" },
                h("button", { class: "btn btn-sm btn-ghost", type: "button", onclick: () => openEditChallenge(challenge) }, icon("edit"), "Edit"),
                h("button", {
                    class: "icon-btn", type: "button", "aria-label": "Delete challenge", title: "Delete",
                    onclick: async () => {
                        const ok = await confirmDialog({ title: "Delete this challenge?", text: `"${challenge.name}" and its prompts will be removed. Your books aren't affected.` });
                        if (!ok) return;
                        await run(async () => {
                            await deleteChallenge(challenge.id);
                            location.hash = "#/challenges";
                        }, "Challenge deleted");
                    }
                }, icon("trash"))),
            h("h1", { class: "board-title" }, challenge.name),
            challenge.description ? h("p", { class: "board-kind" }, challenge.description) : null,
            h("div", { class: "board-progress" },
                progressBar(p.percent),
                h("span", { class: "board-count" }, `${p.done}/${p.total} · ${p.percent}%`)),
            complete ? h("p", { class: "board-done" }, "Challenge complete! 🎉") : null,
            h("ol", { class: "board-slots" }, challenge.items.map((item, i) => slot(challenge, item, i))),
            addForm
        )
    );
}

function slot(challenge, item, index) {
    const book = item.bookId ? getBook(item.bookId) : null;
    const done = challengeItemDone(item);
    const colour = promptColour(item.label);

    const art = book
        ? cover(book, "md")
        : h("span", { class: "slot-empty" }, h("span", { class: "slot-plus" }, icon("plus")));
    const box = h("span", { class: "slot-box", style: !book && colour ? { background: colour } : null }, art,
        done ? h("span", { class: "slot-check", "aria-hidden": "true" }, icon("check")) : null,
        book && !done ? h("span", { class: "slot-status" }, book.status) : null);
    if (!book && !colour) box.classList.add(`slot-tint-${index % 3}`);
    if (!book && colour && DARK_COLOURS.has(colour)) box.classList.add("is-dark");

    const name = [item.label, book ? book.title : "no book yet", done ? "done" : null].filter(Boolean).join(", ");
    return h("li", { class: `board-slot${done ? " is-done" : ""}` },
        h("span", { class: "slot-label", "aria-hidden": "true" }, item.label),
        h("button", { type: "button", class: "slot-btn", "aria-label": name, onclick: () => openSlot(challenge, index) }, box),
        book ? h("span", { class: "slot-title" }, book.title) : null
    );
}

// Titles that start with the prompt's letter come first ("The Hobbit" counts for H as well as T).
function bookOptions(label, selectedId) {
    const letter = /^[a-z]$/i.test(label) ? label.toUpperCase() : null;
    const books = [...state.books].sort((a, b) => a.title.localeCompare(b.title));
    const starts = (b) => {
        const t = b.title.trim().toUpperCase();
        return t.startsWith(letter) || t.replace(/^(THE|AN|A)\s+/, "").startsWith(letter);
    };
    const option = (b) => h("option", { value: b.id, selected: b.id === selectedId }, `${b.title} — ${b.author}`);
    const suggested = letter ? books.filter(starts) : [];

    return [
        h("option", { value: "" }, "No book yet"),
        suggested.length ? h("optgroup", { label: `Starts with ${letter}` }, suggested.map(option)) : null,
        h("optgroup", { label: suggested.length ? "All books" : "Your books" }, books.map(option))
    ];
}

// Click a slot: link a book, mark it done, or remove the prompt.
function openSlot(challenge, index) {
    const item = challenge.items[index];
    const book = item.bookId ? getBook(item.bookId) : null;

    const select = h("select", { class: "select", id: "slotBook" }, bookOptions(item.label, book?.id));
    const done = h("input", { type: "checkbox", id: "slotDone", checked: item.done });
    const autoDone = book?.status === "Read";

    const removeBtn = h("button", {
        type: "button", class: "link-btn left danger-link",
        onclick: async () => {
            if (challenge.items.length === 1) return toast("A challenge needs at least one prompt.", { error: true });
            m.close();
            const ok = await confirmDialog({ title: "Remove this prompt?", text: `"${item.label}" will be removed from the challenge.`, okLabel: "Remove" });
            if (ok) await run(() => updateChallenge(challenge.id, { items: challenge.items.filter((_, i) => i !== index) }), "Prompt removed");
        }
    }, "Remove prompt");

    const m = modal({
        title: item.label,
        size: "sm",
        submitLabel: "Save",
        body: h("div", { class: "stack" },
            book ? h("a", { class: "slot-preview", href: `#/book/${book.id}`, onclick: () => m.close() },
                cover(book, "xs"),
                h("span", {}, h("strong", {}, book.title), h("small", {}, book.author)),
                statusBadge(book.status)) : null,
            h("div", { class: "field" }, h("label", { for: "slotBook" }, book ? "Change book" : "Book for this prompt"), select),
            h("label", { class: "check", for: "slotDone" }, done,
                h("span", {}, "Mark as done",
                    h("small", {}, autoDone ? "Already done: the book is marked Read" : "Or it's done automatically once the book is marked Read")))
        ),
        footer: [removeBtn],
        initialFocus: select,
        async onSubmit() {
            const changes = { bookId: select.value || null, done: done.checked };
            if (changes.bookId === item.bookId && changes.done === item.done) return;
            await updateChallenge(challenge.id, { items: challenge.items.map((it, i) => (i === index ? { ...it, ...changes } : it)) });
            toast(changes.bookId !== item.bookId ? (changes.bookId ? "Book linked" : "Book unlinked") : "Prompt saved");
        }
    });
}

// ---------- Edit name / kind ----------

function openEditChallenge(challenge) {
    const name = h("input", { class: "input", id: "chName", maxlength: 120, autocomplete: "off", value: challenge.name });
    const kind = h("textarea", { class: "textarea", id: "chKind", rows: 2, maxlength: 1000, placeholder: "e.g. Read a book with a cover of every colour" }, challenge.description);

    modal({
        title: "Edit challenge",
        size: "sm",
        submitLabel: "Save",
        body: h("div", { class: "stack" },
            h("div", { class: "field" }, h("label", { for: "chName" }, "Challenge title"), name),
            h("div", { class: "field" }, h("label", { for: "chKind" }, "What kind of challenge is it?"), kind)),
        initialFocus: name,
        async onSubmit({ setError }) {
            if (!name.value.trim()) return setError("Give your challenge a title."), false;
            await updateChallenge(challenge.id, { name: name.value.trim(), description: kind.value.trim() });
            toast("Challenge saved");
        }
    });
}
