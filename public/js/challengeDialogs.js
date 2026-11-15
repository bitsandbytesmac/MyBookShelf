// Challenge dialogs: create/edit a challenge, edit a spot's matching rules, the spot panel (book in the
// spot + matching books from the library + new book ideas), the "fill from finished books" review, and
// the "you unlocked spots" prompt shown when a book is finished.
import { api } from "./api.js";
import {
    state, getBook, getChallenge, createChallenge, updateChallenge, assignSpots, createBook, genreOptions,
    onBookFinished, today, FORMATS, AGE_CATEGORIES
} from "./store.js";
import {
    matchSpot, describeCriteria, hasCriteria, suggestionsForSpot, proposeFills, unlocksForFinishedBook,
    challengeProgress, inWindow, searchQueryForSpot
} from "./challengeMatch.js";
import { h, icon, cover, statusBadge, multiSelect, modal, toast, fmt, confirmDialog } from "./ui.js";
import { bookFromGoogle } from "./dialogs.js";

export const challengeHref = (id) => `#/challenges/${encodeURIComponent(id)}`;

// ---------- Small pieces ----------

// Chips explaining why a book matches. Confirmed reasons are solid, "possible" ones dashed.
export function reasonChips(match) {
    return h("span", { class: "reason-chips" },
        match.reasons.map((r) => h("span", { class: `reason-chip${r.confirmed ? "" : " is-possible"}` }, r.text)));
}

export function matchBadge(status) {
    return status === "confirmed"
        ? h("span", { class: "match-badge is-confirmed" }, icon("check"), "Confirmed match")
        : h("span", { class: "match-badge is-possible" }, "Possible match");
}

export function ruleChips(criteria) {
    const rules = describeCriteria(criteria);
    return rules.length
        ? h("span", { class: "rule-chips" }, rules.map((r) => h("span", { class: "rule-chip" }, r)))
        : h("span", { class: "rule-chips" }, h("span", { class: "rule-chip is-manual" }, "Chosen by hand"));
}

// Plain toggle pills for fixed choices (age, format): no "add your own".
function pillToggles(options, selected = [], label) {
    const chosen = new Set(selected);
    const el = h("div", { class: "pills", role: "group", "aria-label": label },
        options.map((opt) => {
            const b = h("button", {
                type: "button", class: "pill", "aria-pressed": String(chosen.has(opt)),
                onclick: () => {
                    chosen.has(opt) ? chosen.delete(opt) : chosen.add(opt);
                    b.setAttribute("aria-pressed", String(chosen.has(opt)));
                }
            }, opt);
            return b;
        }));
    return { el, get value() { return options.filter((o) => chosen.has(o)); } };
}

const field = (id, label, control, hint) =>
    h("div", { class: "field" }, h("label", { for: id }, label), control, hint ? h("span", { class: "hint" }, hint) : null);

function fold(label, control, count = 0, open = false) {
    return h("details", { class: "foldout", open },
        h("summary", {}, label, h("span", { class: "fold-count" }, count ? `${count} set` : "")),
        h("div", { class: "foldout-body" }, control));
}

async function run(action, message) {
    try {
        await action();
        if (message) toast(message);
    } catch (error) {
        toast(error.message, { error: true });
    }
}

// ---------- Templates ----------

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const YEAR = new Date().getFullYear();

export const TEMPLATES = {
    genres: {
        label: "Genre explorer",
        name: "Genre Explorer",
        description: "Read one book from each genre.",
        spots: ["Fantasy", "Romance", "Mystery", "Thriller", "Science Fiction", "Horror", "Historical Fiction",
            "Literary Fiction", "Contemporary", "Non-fiction", "Classics", "Poetry"].map((g) => ({ label: g, criteria: { genres: [g] } }))
    },
    az: {
        label: "A to Z titles",
        name: "A to Z Challenge",
        description: "Read a book whose title starts with every letter of the alphabet.",
        spots: ALPHABET.map((l) => ({ label: l, criteria: { title: { mode: "startsWith", value: l, ignoreArticles: true } } }))
    },
    tropes: {
        label: "Trope bingo",
        name: "Trope Bingo",
        description: "Fill the card with your favourite tropes.",
        spots: ["Enemies to Lovers", "Found Family", "Slow Burn", "Forced Proximity", "Fake Dating", "Chosen One",
            "Second Chance", "Grumpy x Sunshine", "Morally Grey"].map((t) => ({ label: t, criteria: { tropes: [t] } }))
    },
    world: {
        label: "Around the world (settings)",
        name: "Around the World",
        description: "Travel through books set in different places and times.",
        spots: ["Japan", "Paris", "London", "New York", "Island", "Desert", "Space", "Small town", "Royal court"]
            .map((s) => ({ label: s, criteria: { settings: [s] } }))
    },
    rainbow: {
        label: "Rainbow covers (you pick each book)",
        name: "Rainbow Reading Challenge",
        description: "Read a book with a cover of every colour. Cover colours can't be checked automatically, so you pick each book.",
        spots: ["Red", "Orange", "Yellow", "Green", "Dark Blue", "Light Blue", "Purple", "Pink", "White", "Black", "Brown", "Grey"]
            .map((c) => ({ label: c }))
    },
    custom: { label: "My own spots", name: "", description: "", spots: [] }
};

// ---------- Create / edit a challenge ----------

export function openCreateChallenge() {
    let key = "genres";
    const template = h("select", { class: "select", id: "chTemplate" },
        Object.entries(TEMPLATES).map(([k, t]) => h("option", { value: k, selected: k === key }, t.label)));
    const name = h("input", { class: "input", id: "chName", maxlength: 120, autocomplete: "off", value: TEMPLATES[key].name });
    const kind = h("textarea", { class: "textarea", id: "chKind", rows: 2, maxlength: 1000, placeholder: "e.g. Read one book from each genre" }, TEMPLATES[key].description);
    const starts = h("input", { class: "input", id: "chStarts", type: "date", value: `${YEAR}-01-01` });
    const ends = h("input", { class: "input", id: "chEnds", type: "date", value: `${YEAR}-12-31` });
    const auto = h("input", { type: "checkbox", id: "chAuto", checked: true });
    const spots = h("textarea", { class: "textarea", id: "chSpots", rows: 6, placeholder: "One spot per line, e.g.\nA book set by the sea\nA debut novel\nA book with a map" });
    const spotsField = field("chSpots", "Spots", spots, "You can add matching rules to each spot afterwards.");
    const preview = h("p", { class: "hint template-preview" });

    const sync = () => {
        const t = TEMPLATES[template.value];
        // Keep anything the reader typed; only swap text that came from the previous template.
        if (!name.value.trim() || Object.values(TEMPLATES).some((x) => x.name === name.value)) name.value = t.name;
        if (!kind.value.trim() || Object.values(TEMPLATES).some((x) => x.description === kind.value)) kind.value = t.description;
        spotsField.classList.toggle("hidden", template.value !== "custom");
        const ruled = t.spots.filter((s) => hasCriteria(s.criteria)).length;
        preview.textContent = template.value === "custom" ? ""
            : `${fmt.plural(t.spots.length, "spot")}: ${t.spots.slice(0, 6).map((s) => s.label).join(", ")}${t.spots.length > 6 ? "…" : ""}. `
            + (ruled ? "Each spot has matching rules, so finished books fill it automatically." : "You choose the book for each spot.");
        key = template.value;
    };
    template.addEventListener("change", sync);
    sync();

    modal({
        title: "New challenge",
        submitLabel: "Create challenge",
        body: h("div", { class: "stack" },
            field("chTemplate", "Start from", template),
            preview,
            field("chName", "Challenge title", name),
            field("chKind", "What kind of challenge is it?", kind),
            h("div", { class: "field-row" }, field("chStarts", "Starts", starts), field("chEnds", "Ends", ends)),
            h("span", { class: "hint" }, "Books finished between these dates count. Clear both for a challenge with no dates."),
            spotsField,
            h("label", { class: "check", for: "chAuto" }, auto,
                h("span", {}, "Match books automatically", h("small", {}, "When you finish a book, show the spots it unlocks")))
        ),
        initialFocus: name,
        async onSubmit({ setError }) {
            if (!name.value.trim()) return setError("Give your challenge a title."), false;
            if (starts.value && ends.value && ends.value < starts.value) return setError("The end date can't be before the start date."), false;
            const items = key === "custom"
                ? spots.value.split("\n").map((l) => l.trim()).filter(Boolean).map((label) => ({ label, bookId: null }))
                : TEMPLATES[key].spots.map((s) => ({ ...s, bookId: null }));
            if (!items.length) return setError("Add at least one spot."), false;
            if (items.length > 200) return setError("That's more than 200 spots."), false;

            const saved = await createChallenge({
                name: name.value.trim(), description: kind.value.trim(),
                startsOn: starts.value || null, endsOn: ends.value || null, autoMatch: auto.checked, items
            });
            toast("Challenge created");
            location.hash = challengeHref(saved.id);
            // Books already finished may fit right away.
            if (proposeFills(saved, state.books).length) setTimeout(() => openFillReview(saved.id), 50);
        }
    });
}

export function openEditChallenge(challenge) {
    const name = h("input", { class: "input", id: "chName", maxlength: 120, autocomplete: "off", value: challenge.name });
    const kind = h("textarea", { class: "textarea", id: "chKind", rows: 2, maxlength: 1000 }, challenge.description);
    const starts = h("input", { class: "input", id: "chStarts", type: "date", value: challenge.startsOn || "" });
    const ends = h("input", { class: "input", id: "chEnds", type: "date", value: challenge.endsOn || "" });
    const auto = h("input", { type: "checkbox", id: "chAuto", checked: challenge.autoMatch !== false });

    modal({
        title: "Edit challenge",
        size: "sm",
        submitLabel: "Save",
        body: h("div", { class: "stack" },
            field("chName", "Challenge title", name),
            field("chKind", "What kind of challenge is it?", kind),
            h("div", { class: "field-row" }, field("chStarts", "Starts", starts), field("chEnds", "Ends", ends)),
            h("label", { class: "check", for: "chAuto" }, auto,
                h("span", {}, "Match books automatically", h("small", {}, "When you finish a book, show the spots it unlocks")))
        ),
        initialFocus: name,
        async onSubmit({ setError }) {
            if (!name.value.trim()) return setError("Give your challenge a title."), false;
            if (starts.value && ends.value && ends.value < starts.value) return setError("The end date can't be before the start date."), false;
            await updateChallenge(challenge.id, {
                name: name.value.trim(), description: kind.value.trim(),
                startsOn: starts.value || null, endsOn: ends.value || null, autoMatch: auto.checked
            });
            toast("Challenge saved");
        }
    });
}

// ---------- A spot's matching rules ----------

// index === null adds a new spot.
export function openSpotEditor(challengeId, index = null) {
    const challenge = getChallenge(challengeId);
    if (!challenge) return;
    const item = index === null ? { label: "", criteria: {} } : challenge.items[index];
    const c = item.criteria || {};

    const label = h("input", { class: "input", id: "spLabel", maxlength: 200, value: item.label, placeholder: "e.g. A book set by the sea", autocomplete: "off" });
    const tagSelect = (kind, lbl, extra = []) => multiSelect({
        options: [...new Set([...genreOptions(kind), ...extra])], selected: c[kind === "subgenres" ? "genres" : kind] || [], label: lbl, placeholder: `Other ${lbl.toLowerCase()}`
    });
    const genres = multiSelect({
        options: [...new Set([...genreOptions("genres"), ...genreOptions("subgenres")])], selected: c.genres || [], label: "Genres", placeholder: "Other genre"
    });
    const tropes = tagSelect("tropes", "Tropes");
    const themes = tagSelect("themes", "Themes & keywords");
    const settings = tagSelect("settings", "Setting");
    const characters = tagSelect("characters", "Characters");
    const ages = pillToggles(AGE_CATEGORIES, c.ageCategory, "Age category");
    const formats = pillToggles(FORMATS, c.format, "Format");

    const titleMode = h("select", { class: "select", id: "spTitleMode" },
        [["", "Any title"], ["startsWith", "Starts with"], ["contains", "Contains"]].map(([v, t]) => h("option", { value: v, selected: (c.title?.mode || "") === v }, t)));
    const titleValue = h("input", { class: "input", id: "spTitleValue", maxlength: 60, value: c.title?.value || "", placeholder: "e.g. B or Night", autocomplete: "off" });
    const author = h("input", { class: "input", id: "spAuthor", maxlength: 120, value: c.author || "", placeholder: "Any author", autocomplete: "off" });
    const num = (id, value, placeholder) => h("input", { class: "input", id, type: "number", min: 0, inputmode: "numeric", value: value ?? "", placeholder });
    const minPages = num("spMinPages", c.minPages, "Min");
    const maxPages = num("spMaxPages", c.maxPages, "Max");
    const yearFrom = num("spYearFrom", c.yearFrom, "From");
    const yearTo = num("spYearTo", c.yearTo, "To");

    const count = (list) => list.length;
    modal({
        title: index === null ? "Add a spot" : "Spot rules",
        submitLabel: index === null ? "Add spot" : "Save rules",
        body: h("div", { class: "stack spot-editor" },
            field("spLabel", "Prompt", label),
            h("p", { class: "hint" }, "A book has to meet every rule you set; inside a list, any one tag is enough. "
                + "Leave every rule empty to pick books by hand (for things like cover colours)."),
            fold("Genres", genres.el, count(c.genres || []), Boolean(c.genres?.length)),
            fold("Tropes", tropes.el, count(c.tropes || []), Boolean(c.tropes?.length)),
            fold("Themes & keywords", themes.el, count(c.themes || []), Boolean(c.themes?.length)),
            fold("Setting", settings.el, count(c.settings || []), Boolean(c.settings?.length)),
            fold("Characters", characters.el, count(c.characters || []), Boolean(c.characters?.length)),
            h("div", { class: "field-row" },
                field("spTitleMode", "Title", titleMode),
                field("spTitleValue", "Title text", titleValue)),
            field("spAuthor", "Author name contains", author),
            h("div", { class: "field-row" },
                h("div", { class: "field" }, h("span", { class: "label" }, "Pages"), h("div", { class: "range-pair" }, minPages, h("span", {}, "to"), maxPages)),
                h("div", { class: "field" }, h("span", { class: "label" }, "Published"), h("div", { class: "range-pair" }, yearFrom, h("span", {}, "to"), yearTo))),
            h("div", { class: "field" }, h("span", { class: "label" }, "Age category"), ages.el),
            h("div", { class: "field" }, h("span", { class: "label" }, "Format"), formats.el)
        ),
        initialFocus: label,
        async onSubmit({ setError }) {
            const text = label.value.trim();
            if (!text) return setError("Write the spot's prompt."), false;
            const int = (input, name) => {
                if (input.value.trim() === "") return { value: undefined };
                const n = Number(input.value);
                return Number.isInteger(n) && n >= 0 ? { value: n } : { error: `${name} must be a whole number.` };
            };
            const parts = { minPages: int(minPages, "Minimum pages"), maxPages: int(maxPages, "Maximum pages"), yearFrom: int(yearFrom, "Published from"), yearTo: int(yearTo, "Published to") };
            const bad = Object.values(parts).find((p) => p.error);
            if (bad) return setError(bad.error), false;
            if (titleMode.value && !titleValue.value.trim()) return setError("Type the title text, or set Title to “Any title”."), false;

            const criteria = {
                genres: genres.value, tropes: tropes.value, themes: themes.value, settings: settings.value, characters: characters.value,
                ageCategory: ages.value, format: formats.value,
                ...(titleMode.value ? { title: { mode: titleMode.value, value: titleValue.value.trim(), ignoreArticles: true } } : {}),
                ...(author.value.trim() ? { author: author.value.trim() } : {}),
                ...Object.fromEntries(Object.entries(parts).filter(([, p]) => p.value !== undefined).map(([k, p]) => [k, p.value]))
            };
            for (const k of Object.keys(criteria)) if (Array.isArray(criteria[k]) && !criteria[k].length) delete criteria[k];
            if (criteria.minPages && criteria.maxPages && criteria.maxPages < criteria.minPages) return setError("Maximum pages can't be less than minimum pages."), false;

            const fresh = getChallenge(challengeId);
            const items = index === null
                ? [...fresh.items, { label: text, bookId: null, criteria }]
                : fresh.items.map((it, i) => (i === index ? { ...it, label: text, criteria } : it));
            await updateChallenge(challengeId, { items });
            toast(index === null ? "Spot added" : "Spot rules saved");
        }
    });
}

// ---------- The spot panel: its book, matches from the library, new ideas ----------

export function openSpot(challengeId, index) {
    const challenge = getChallenge(challengeId);
    const item = challenge?.items[index];
    if (!item) return;
    const book = item.bookId ? getBook(item.bookId) : null;
    const groups = suggestionsForSpot(challenge, index, state.books);
    const manual = !hasCriteria(item.criteria);

    const assign = (bookId, message) => {
        m.close();
        run(() => assignSpots(challengeId, { [index]: bookId }), message);
    };

    const bookRow = (entry, action) => h("li", { class: "match-row" },
        h("a", { href: `#/book/${entry.book.id}`, class: "match-cover", onclick: () => m.close(), "aria-label": entry.book.title }, cover(entry.book, "xs")),
        h("div", { class: "match-info" },
            h("strong", {}, entry.book.title),
            h("span", { class: "match-meta" }, entry.book.author, " · ", statusBadge(entry.book.status)),
            entry.match ? reasonChips(entry.match) : null),
        action);

    const section = (title, hint, entries, makeAction) => entries.length
        ? h("section", { class: "match-section" },
            h("h3", {}, title, h("span", { class: "count" }, entries.length)),
            hint ? h("p", { class: "hint" }, hint) : null,
            h("ul", { class: "match-list" }, entries.slice(0, 8).map((e) => bookRow(e, makeAction(e)))))
        : null;

    // Current book in the spot.
    let current = null;
    if (book) {
        const counts = book.status === "Read";
        const match = matchSpot(book, item.criteria);
        current = h("section", { class: `spot-current${counts ? " is-done" : ""}` },
            h("span", { class: "label" }, counts ? "In this spot · counts" : "In this spot · planned"),
            bookRow({ book, match: match.status === "manual" ? null : match },
                h("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => assign(null, "Book removed from the spot") }, "Remove")),
            counts ? null : h("p", { class: "hint" }, "It counts as soon as you finish it."),
            counts && !inWindow(book, challenge) ? h("p", { class: "hint" }, "Finished outside the challenge dates. It still counts because you chose it.") : null);
    } else if (!item.bookId && item.done) {
        current = h("section", { class: "spot-current is-done" }, h("span", { class: "label" }, "Marked done (from before smart challenges)"));
    }

    const verb = book ? "Replace" : null;
    const ideas = h("div", { class: "spot-ideas" });
    const findBtn = h("button", { type: "button", class: "btn btn-sm", onclick: () => loadIdeas() }, icon("search"), "Find new books for this spot");
    async function loadIdeas() {
        findBtn.disabled = true;
        ideas.replaceChildren(h("p", { class: "hint" }, "Searching Google Books…"));
        try {
            const results = (await api.searchGoogleBooks(searchQueryForSpot(item))).slice(0, 6).map(bookFromGoogle);
            const owned = new Set(state.books.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`));
            const fresh = results.filter((b) => !owned.has(`${b.title.toLowerCase()}|${b.author.toLowerCase()}`));
            ideas.replaceChildren(fresh.length
                ? h("ul", { class: "match-list" }, fresh.map((b) => h("li", { class: "match-row" },
                    h("span", { class: "match-cover" }, cover(b, "xs")),
                    h("div", { class: "match-info" },
                        h("strong", {}, b.title),
                        h("span", { class: "match-meta" }, [b.author, b.publishedYear].filter(Boolean).join(" · ")),
                        b.genres.length ? h("span", { class: "reason-chips" }, b.genres.map((g) => h("span", { class: "reason-chip is-possible" }, g))) : null),
                    h("button", {
                        type: "button", class: "btn btn-sm",
                        onclick: async (e) => {
                            e.target.disabled = true;
                            try {
                                const saved = await createBook({ ...b, status: "To Be Read" });
                                await assignSpots(challengeId, { [index]: saved.id });
                                m.close();
                                toast(`"${saved.title}" added to your TBR and planned for this spot`);
                            } catch (error) {
                                e.target.disabled = false;
                                toast(error.message, { error: true });
                            }
                        }
                    }, icon("plus"), "Add to TBR"))))
                : h("p", { class: "hint" }, "No new ideas found. Try adding a theme or genre to the spot's rules."));
        } catch (error) {
            ideas.replaceChildren(h("p", { class: "hint" }, error.message));
        } finally {
            findBtn.disabled = false;
        }
    }

    // Pick any book by hand (the only way for spots without rules).
    const used = new Set(challenge.items.filter((_, i) => i !== index).map((it) => it.bookId).filter(Boolean));
    const pickable = state.books.filter((b) => !used.has(b.id) && b.id !== item.bookId && b.status !== "DNF")
        .sort((a, b) => Number(b.status === "Read") - Number(a.status === "Read") || a.title.localeCompare(b.title));
    const picker = h("select", { class: "select", id: "spotPick" }, // named by its visible <label>

        h("option", { value: "" }, "Choose a book…"),
        pickable.length ? h("optgroup", { label: "Finished" }, pickable.filter((b) => b.status === "Read").map((b) => h("option", { value: b.id }, `${b.title} — ${b.author}`))) : null,
        pickable.some((b) => b.status !== "Read") ? h("optgroup", { label: "Not finished yet (planned)" }, pickable.filter((b) => b.status !== "Read").map((b) => h("option", { value: b.id }, `${b.title} — ${b.author}`))) : null);

    const removeSpot = h("button", {
        type: "button", class: "link-btn left danger-link",
        onclick: async () => {
            if (challenge.items.length === 1) return toast("A challenge needs at least one spot.", { error: true });
            m.close();
            if (await confirmDialog({ title: "Remove this spot?", text: `"${item.label}" will be removed from the challenge.`, okLabel: "Remove" })) {
                run(() => updateChallenge(challengeId, { items: getChallenge(challengeId).items.filter((_, i) => i !== index) }), "Spot removed");
            }
        }
    }, "Remove spot");

    const nothing = !manual && !groups.ready.length && !groups.planned.length && !groups.possible.length;
    const m = modal({
        title: item.label,
        footer: [removeSpot,
            h("button", { type: "button", class: "btn", onclick: () => { m.close(); openSpotEditor(challengeId, index); } }, icon("edit"), manual ? "Add rules" : "Edit rules")],
        body: h("div", { class: "stack spot-panel" },
            h("div", { class: "spot-rules" }, h("span", { class: "label" }, challenge.name), ruleChips(item.criteria)),
            current,
            section(verb ? `${verb} with a finished book` : "Ready to count", "Finished books that meet every rule.", groups.ready,
                (e) => h("button", { type: "button", class: "btn btn-sm btn-primary", onclick: () => assign(e.book.id, `"${e.book.title}" counts for ${item.label}`) }, "Count this")),
            section("On your TBR or reading now", "These fit. Plan one and it counts when you finish it.", groups.planned,
                (e) => h("button", { type: "button", class: "btn btn-sm", onclick: () => assign(e.book.id, `"${e.book.title}" planned for ${item.label}`) }, "Plan this")),
            section("Possible matches", "Something in the summary suggests these fit, but their tags don't say so. Check before using one.", groups.possible,
                (e) => h("button", { type: "button", class: "btn btn-sm btn-ghost", onclick: () => assign(e.book.id, `"${e.book.title}" added to ${item.label}`) }, "Use anyway")),
            nothing ? h("p", { class: "empty-sm" }, "No book on your shelf fits these rules yet. Find new ideas below, or add tags to your books in Edit details.") : null,
            h("div", { class: "field spot-manual" },
                h("label", { for: "spotPick" }, manual ? "Choose the book for this spot" : "Or choose any book yourself"),
                h("div", { class: "spot-manual-row" }, picker,
                    h("button", { type: "button", class: "btn btn-sm", onclick: () => picker.value && assign(picker.value, "Book added to the spot") }, "Use"))),
            h("div", { class: "spot-discover" }, findBtn, ideas)
        )
    });
}

// ---------- Fill open spots from books already finished ----------

export function openFillReview(challengeId) {
    const challenge = getChallenge(challengeId);
    if (!challenge) return;
    const proposals = proposeFills(challenge, state.books);
    if (!proposals.length) return toast("No finished books fit the open spots yet.");

    const boxes = proposals.map((p) => {
        const box = h("input", { type: "checkbox", checked: true, "aria-label": `${challenge.items[p.index].label}: ${p.book.title}` });
        return { p, box };
    });

    modal({
        title: "Books you've already read fit!",
        submitLabel: "Count them",
        body: h("div", { class: "stack" },
            h("p", { class: "hint" }, `These finished books meet every rule of an open spot in “${challenge.name}”. Untick any you don't want to count.`),
            h("ul", { class: "match-list" }, boxes.map(({ p, box }) => h("li", { class: "match-row is-pick" },
                h("label", { class: "pick-box" }, box),
                h("span", { class: "match-cover" }, cover(p.book, "xs")),
                h("div", { class: "match-info" },
                    h("strong", {}, `${challenge.items[p.index].label}`),
                    h("span", { class: "match-meta" }, p.book.title),
                    reasonChips(p.match)))))),
        async onSubmit() {
            const chosen = Object.fromEntries(boxes.filter((b) => b.box.checked).map(({ p }) => [p.index, p.book.id]));
            if (!Object.keys(chosen).length) return;
            await assignSpots(challengeId, chosen);
            toast(`${fmt.plural(Object.keys(chosen).length, "spot")} unlocked 🎉`);
        }
    });
}

// ---------- "You unlocked spots": shown when a book is finished ----------

export function openUnlockDialog(book) {
    const groups = unlocksForFinishedBook(book, state.challenges, state.books, today());
    if (!groups.length) return;

    const completedOnly = groups.every((g) => !g.options.length);
    if (completedOnly) {
        const n = groups.reduce((s, g) => s + g.completed.length, 0);
        toast(`"${book.title}" completed ${fmt.plural(n, "challenge spot")} 🎉`);
        return;
    }

    const choices = [];
    const body = h("div", { class: "stack unlock" },
        h("div", { class: "unlock-book" }, cover(book, "sm"),
            h("div", {}, h("strong", {}, book.title), h("span", { class: "hint" }, "matches these challenge spots. Choose which ones it counts for."))),
        groups.map((g) => {
            const after = challengeProgress(g.challenge, state.books);
            return h("section", { class: "unlock-group" },
                h("h3", {}, g.challenge.name, h("span", { class: "count" }, `${after.done}/${after.total}`)),
                g.completed.map((i) => h("p", { class: "unlock-done" }, icon("check"), `${g.challenge.items[i].label}: completed (you'd planned this book)`)),
                h("ul", { class: "match-list" }, g.options.map((o) => {
                    const box = h("input", { type: "checkbox", checked: o.checked, "aria-label": `${g.challenge.name}: ${o.item.label}` });
                    choices.push({ challengeId: g.challenge.id, index: o.index, box });
                    return h("li", { class: "match-row is-pick" },
                        h("label", { class: "pick-box" }, box),
                        h("div", { class: "match-info" },
                            h("strong", {}, o.item.label),
                            matchBadge(o.match.status),
                            reasonChips(o.match)));
                })));
        }),
        h("p", { class: "hint" }, "Confirmed matches meet every rule from the book's own tags. Possible matches only come from words in the summary, so they're never ticked for you."));

    modal({
        title: "You unlocked challenge spots!",
        submitLabel: "Count it",
        body,
        footer: [],
        async onSubmit() {
            const byChallenge = {};
            for (const c of choices) if (c.box.checked) (byChallenge[c.challengeId] ||= {})[c.index] = book.id;
            const ids = Object.keys(byChallenge);
            if (!ids.length) return;
            for (const id of ids) await assignSpots(id, byChallenge[id]);
            const n = Object.values(byChallenge).reduce((s, o) => s + Object.keys(o).length, 0);
            toast(`${fmt.plural(n, "spot")} unlocked 🎉`);
        }
    });
}

// Finishing a book anywhere in the app (status menu, Log your reading, Edit details) offers its spots.
onBookFinished(openUnlockDialog);
