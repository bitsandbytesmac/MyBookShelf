// Single book page: details, reading sessions, notes, and review.
import { state, getBook, updateBook, deleteBook, percent, STATUSES, authorNames } from "./store.js";
import { h, icon, cover, progressBar, statusBadge, stars, chilis, fmt, toast, confirmDialog, authorHref, seriesHref, seriesLabel } from "./ui.js";
import { openEditBook, openReview } from "./dialogs.js";
import { loadingSkeleton } from "./dashboard.js";
import { openLogReading } from "./logReading.js";

// Notes drafts survive re-renders while typing.
const noteDrafts = new Map();

async function run(action, message) {
    try {
        await action();
        if (message) toast(message);
    } catch (error) {
        toast(error.message, { error: true });
    }
}

export function renderBookPage(params, id) {
    if (!state.loaded) return loadingSkeleton();

    const book = getBook(id);
    if (!book) {
        return h("div", { class: "card empty" },
            h("h3", {}, "Book not found"),
            h("p", {}, "It may have been deleted."),
            h("a", { class: "btn", href: "#/library" }, "Back to library"));
    }

    return h("div", {},
        h("a", { class: "back-link", href: "#/library" }, icon("back"), "Library"),
        hero(book),
        h("div", { class: "book-cols" },
            h("div", {}, progressCard(book), reviewCard(book)),
            h("div", {}, detailsCard(book), notesCard(book))
        )
    );
}

// ---------- Hero ----------

function hero(book) {
    const statusSelect = h("select", {
        class: "select", "aria-label": "Book status", style: { width: "auto", height: "38px", borderRadius: "999px" },
        onchange: (e) => run(() => updateBook(book.id, { status: e.target.value }), `Moved to ${e.target.value}`)
    }, STATUSES.map((s) => h("option", { value: s, selected: s === book.status }, s)));

    const summary = book.summary
        ? h("p", { class: "summary-text clamped" }, book.summary)
        : h("p", { class: "summary-text muted" }, "No summary yet. ",
            h("button", { class: "link-btn", type: "button", onclick: () => openEditBook(book) }, "Add one"));

    let toggle = null;
    if (book.summary && book.summary.length > 420) {
        toggle = h("button", {
            class: "link-btn", type: "button", style: { marginTop: "6px" },
            onclick: () => {
                const clamped = summary.classList.toggle("clamped");
                toggle.textContent = clamped ? "Read more" : "Show less";
            }
        }, "Read more");
    } else if (book.summary) {
        summary.classList.remove("clamped");
    }

    return h("section", { class: "book-hero" },
        cover(book, "lg"),
        h("div", { style: { minWidth: 0, width: "100%" } },
            h("h1", {}, book.title),
            h("p", { class: "by" }, "by ", authorNames(book).flatMap((name, i) => [i ? ", " : null, h("a", { href: authorHref(name) }, name)])),
            book.series ? h("a", { class: "series-link", href: seriesHref(book.series) }, icon("layers"), seriesLabel(book)) : null,
            h("div", { class: "badge-row" },
                statusBadge(book.status),
                book.format ? h("span", { class: "badge meta" }, book.format) : null,
                book.ownership ? h("span", { class: "badge meta" }, book.ownership) : null,
                book.ageCategory ? h("span", { class: "badge meta" }, book.ageCategory) : null,
                book.genres.map((g) => h("span", { class: "badge tag" }, g)),
                book.subgenres.map((g) => h("span", { class: "badge tag-sub" }, g))
            ),
            book.tropes.length
                ? h("div", { class: "badge-row trope-row", "aria-label": "Tropes" }, book.tropes.map((t) => h("span", { class: "badge trope" }, t)))
                : null,
            summary,
            toggle,
            h("div", { class: "hero-actions" },
                h("button", { class: "btn btn-primary", type: "button", onclick: () => openReview(book) }, icon("pen"), book.rating || book.review ? "Edit review" : "Write review"),
                h("button", { class: "btn", type: "button", onclick: () => openEditBook(book) }, icon("edit"), "Edit details"),
                statusSelect,
                h("button", {
                    class: `icon-btn${book.isFavorite ? " fav-on" : ""}`, type: "button",
                    "aria-label": book.isFavorite ? "Remove from favorites" : "Add to favorites",
                    "aria-pressed": String(book.isFavorite), title: "Favorite",
                    onclick: () => run(() => updateBook(book.id, { isFavorite: !book.isFavorite }),
                        book.isFavorite ? "Removed from favorites" : "Added to favorites")
                }, icon("heart", { filled: book.isFavorite })),
                h("button", {
                    class: "icon-btn", type: "button", "aria-label": "Delete book", title: "Delete",
                    onclick: async () => {
                        const ok = await confirmDialog({ title: "Delete this book?", text: `"${book.title}" and its review will be removed. This can't be undone.` });
                        if (!ok) return;
                        await run(async () => {
                            await deleteBook(book.id);
                            location.hash = "#/library";
                        }, "Book deleted");
                    }
                }, icon("trash"))
            )
        )
    );
}

// ---------- Reading progress ----------

function progressCard(book) {
    const pct = percent(book);
    const card = h("section", { class: "card card-pad" }, h("h3", {}, "Reading progress"));

    if (!book.totalPages) {
        card.append(
            h("p", { class: "sub" }, "Add the total number of pages to track your progress."),
            h("button", { class: "btn btn-sm", type: "button", style: { marginTop: "14px" }, onclick: () => openEditBook(book) }, "Add page count")
        );
    } else {
        card.append(
            h("div", { class: "session-progress" },
                h("span", { class: "pct" }, `${pct}%`),
                h("span", { class: "pages" }, `Page ${fmt.num(book.currentPage)} of ${fmt.num(book.totalPages)}`)
            ),
            progressBar(pct)
        );
    }

    if (book.status !== "Read") {
        // Same "Log your reading" window as the dashboard and the top bar.
        card.append(h("button", { class: "btn btn-sage session-log", type: "button", onclick: () => openLogReading(book.id) },
            icon("pen"), "Log your reading"));
    } else if (book.dateFinished) {
        card.append(h("p", { class: "sub", style: { marginTop: "12px" } }, `Finished ${fmt.date(book.dateFinished)}`));
    }

    card.append(journalList(book));
    return card;
}

// This book's journal entries: date, pages read and the note.
function journalList(book) {
    const sessions = state.activities.filter((a) => String(a.book_id) === book.id).slice(0, 6);
    if (!sessions.length) return h("p", { class: "hint session-empty" }, "No journal entries yet.");
    return h("ul", { class: "sessions", "aria-label": "Journal entries" }, sessions.map((a) =>
        h("li", {},
            h("span", { class: "session-line" },
                h("span", {}, `${fmt.date(a.session_date || a.created_at)}${a.pages_read > 0 ? ` · p. ${a.previous_page} → ${a.current_page}` : ""}`),
                h("strong", {}, a.pages_read > 0 ? `+${a.pages_read}` : "Note")),
            a.note ? h("span", { class: "session-note" }, a.note) : null)
    ));
}

// ---------- Review ----------

function reviewCard(book) {
    const hasReview = book.rating || book.spice || book.review || book.quotes.length || book.dateStarted || book.dateFinished;

    // Ticking a box saves straight away.
    const toggle = (field, label, hint) => h("label", { class: "check" },
        h("input", {
            type: "checkbox", checked: book[field],
            onchange: (e) => run(() => updateBook(book.id, { [field]: e.target.checked }),
                e.target.checked ? `${label} ticked off` : `${label} unticked`)
        }),
        h("span", {}, label, h("small", {}, hint))
    );

    const card = h("section", { class: "card card-pad" },
        h("div", { class: "review-head" },
            h("h3", {}, "My review"),
            h("button", { class: "btn btn-sm btn-primary", type: "button", onclick: () => openReview(book) }, hasReview ? "Edit" : "Review")
        ),
        h("div", { class: "check-row review-checks" },
            toggle("reviewed", "Review", "Written or posted"),
            toggle("journaled", "Reading journal", "Added to my journal"))
    );

    if (!hasReview) {
        card.append(h("p", { class: "sub", style: { marginTop: "8px" } }, "Rate it, add a spice level, save favourite quotes and write your thoughts."));
        return card;
    }

    card.append(
        h("div", { class: "review-scores" },
            h("div", {}, h("span", { class: "label" }, "Rating"), book.rating ? stars(book.rating) : h("span", { class: "muted" }, "—")),
            h("div", {}, h("span", { class: "label" }, "Spice"), book.spice ? chilis(book.spice) : h("span", { class: "muted" }, "—")),
            h("div", {}, h("span", { class: "label" }, "Started"), h("span", {}, book.dateStarted ? fmt.date(book.dateStarted) : "—")),
            h("div", {}, h("span", { class: "label" }, "Finished"), h("span", {}, book.dateFinished ? fmt.date(book.dateFinished) : "—"))
        ),
        // Element.append() would print a null as the text "null", so only pass real nodes.
        ...[
            book.review ? h("p", { class: "review-text" }, book.review) : null,
            book.quotes.length ? h("div", { class: "review-quotes" }, book.quotes.map((q) => h("blockquote", {}, q))) : null
        ].filter(Boolean)
    );
    return card;
}

// ---------- Details ----------

function detailsCard(book) {
    const row = (label, value) => [h("dt", {}, label), h("dd", {}, value || "—")];
    return h("section", { class: "card card-pad" },
        h("div", { class: "review-head" },
            h("h3", {}, "Details"),
            h("button", { class: "link-btn", type: "button", onclick: () => openEditBook(book) }, "Edit")
        ),
        h("dl", { class: "detail-list" },
            row("Book status", book.status),
            row("Series", book.series ? h("a", { href: seriesHref(book.series) }, seriesLabel(book)) : ""),
            row("Format", book.format),
            row("Status", book.ownership),
            row("Age category", book.ageCategory),
            row("Pages", book.totalPages ? fmt.num(book.totalPages) : ""),
            row("Genres", book.genres.join(", ")),
            row("Sub-genres", book.subgenres.join(", ")),
            row("Tropes", book.tropes.join(", ")),
            row("Content warnings", book.contentWarnings.length
                ? h("details", { class: "cw-reveal" },
                    h("summary", {}, `Show ${fmt.plural(book.contentWarnings.length, "warning")}`),
                    h("span", {}, book.contentWarnings.join(", ")))
                : ""),
            row("Challenges", inChallenges(book)),
            row("Added", book.createdAt ? fmt.date(String(book.createdAt).slice(0, 10)) : "")
        )
    );
}

// "A to Z Challenge · B, Summer Reads · A book set by the sea" as links (empty if none).
function inChallenges(book) {
    const links = state.challenges.flatMap((c) => c.items
        .filter((it) => it.bookId === book.id)
        .map((it) => h("a", { href: `#/challenges/${encodeURIComponent(c.id)}` }, `${c.name} · ${it.label}`)));
    return links.length ? links.flatMap((a, i) => [i ? ", " : null, a]) : "";
}

// ---------- Notes ----------

function notesCard(book) {
    const draft = noteDrafts.get(book.id);
    const textarea = h("textarea", { class: "textarea", rows: 5, placeholder: "Thoughts while reading, theories, reminders…", "aria-label": "Notes" }, draft ?? book.notes);
    const saved = h("span", { class: "saved-hint" });
    const saveBtn = h("button", { class: "btn btn-sm", type: "submit", disabled: (draft ?? book.notes) === book.notes }, "Save notes");

    textarea.addEventListener("input", () => {
        noteDrafts.set(book.id, textarea.value);
        saveBtn.disabled = textarea.value === book.notes;
        saved.textContent = "";
    });

    const form = h("form", { class: "notes-form" }, h("h3", {}, "Notes"), textarea, h("div", { class: "row" }, saved, saveBtn));
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        saveBtn.disabled = true;
        try {
            await updateBook(book.id, { notes: textarea.value.trim() });
            noteDrafts.delete(book.id);
            toast("Notes saved");
        } catch (error) {
            toast(error.message, { error: true });
            saveBtn.disabled = false;
        }
    });

    return h("section", { class: "card card-pad" }, form);
}
