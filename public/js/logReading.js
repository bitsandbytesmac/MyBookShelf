// "Log your reading": pick a book you're reading, then save a journal entry (note + date + the page
// you're on). Saving moves the book's progress on and feeds the dashboard's streak and recent entries.
import { state, getBook, updateBook, nextUpBooks, percent, today } from "./store.js";
import { h, icon, cover, progressBar, statusBadge, fmt, modal, toast } from "./ui.js";

// Books on the go first; if there are none, offer the Next Up / To Be Read pile to start one.
function pickableBooks() {
    const reading = state.books.filter((b) => b.status === "Reading" || b.status === "Paused");
    if (reading.length) return { title: "Currently reading", books: reading };
    const next = nextUpBooks();
    const rest = state.books.filter((b) => b.status === "To Be Read" && !next.includes(b));
    return { title: "Start something new", books: [...next, ...rest] };
}

export function openLogReading(bookId = null) {
    if (bookId) return openLogForm(getBook(bookId));

    const { title, books } = pickableBooks();
    const pick = (book) => {
        m.close();
        openLogForm(book);
    };

    const m = modal({
        title: "Log your reading",
        body: books.length
            ? h("div", { class: "stack" },
                h("p", { class: "hint" }, title === "Currently reading"
                    ? "Which book did you read?"
                    : "You're not reading anything right now. Pick a book to start."),
                h("ul", { class: "log-pick", "aria-label": title },
                    books.map((book) => h("li", {}, h("button", {
                        type: "button", class: "log-pick-book", onclick: () => pick(book),
                        "aria-label": `${book.title} by ${book.author}${book.totalPages && book.status !== "To Be Read" ? `, ${percent(book)}%` : ""}`
                    },
                        cover(book, "md"),
                        h("strong", {}, book.title),
                        h("small", {}, book.author),
                        book.totalPages && book.status !== "To Be Read"
                            ? h("span", { class: "log-pick-progress" }, progressBar(percent(book), { thin: true }), `${percent(book)}%`)
                            : null)))))
            : h("div", { class: "empty-sm" }, "Your shelf is empty. Add a book first, then log your reading here.")
    });
}

function openLogForm(book) {
    if (!book) return toast("That book isn't on your shelf anymore.", { error: true });

    const total = book.totalPages || 0;
    const page = h("input", {
        class: "input log-page", id: "logPage", type: "number", min: 0, inputmode: "numeric",
        value: String(book.currentPage || 0), "aria-label": "Page I'm on", ...(total ? { max: total } : {})
    });
    const preview = h("div", { class: "log-preview" });
    const updatePreview = () => {
        const n = Number(page.value) || 0;
        const read = n - book.currentPage;
        preview.replaceChildren(...[
            total ? progressBar(Math.min(100, Math.round((n / total) * 100)), { thin: true }) : null,
            h("span", {}, [
                total ? `${Math.min(100, Math.round((n / total) * 100))}%` : null,
                read > 0 ? `+${fmt.plural(read, "page")} today` : null
            ].filter(Boolean).join(" · ") || "Same page as last time")
        ].filter(Boolean));
    };
    const step = (delta) => {
        const n = Math.max(0, (Number(page.value) || 0) + delta);
        page.value = String(total ? Math.min(total, n) : n);
        updatePreview();
    };
    page.addEventListener("input", updatePreview);
    updatePreview();

    const note = h("textarea", { class: "textarea", id: "logNote", rows: 5, maxlength: 20000, placeholder: "Thoughts, feelings, favourite moments, theories…" });
    const date = h("input", { class: "input", id: "logDate", type: "date", value: today(), max: today() });

    modal({
        title: "Log your reading",
        submitLabel: "Save to journal",
        busyLabel: "Saving…",
        body: h("div", { class: "stack" },
            h("div", { class: "log-book" },
                cover(book, "sm"),
                h("div", {}, h("strong", {}, book.title), h("small", {}, book.author), statusBadge(book.status))),
            h("div", { class: "log-cols" },
                h("div", { class: "field" }, h("label", { for: "logNote" }, "Notes"), note),
                h("div", { class: "field log-progress" },
                    h("span", { class: "label" }, "Current progress"),
                    h("div", { class: "field" }, h("label", { for: "logDate" }, "Date"), date),
                    h("div", { class: "field" },
                        h("label", { for: "logPage" }, total ? `Page (of ${fmt.num(total)})` : "Page"),
                        h("div", { class: "stepper" },
                            h("button", { type: "button", class: "stepper-btn", "aria-label": "One page back", onclick: () => step(-1) }, "−"),
                            page,
                            h("button", { type: "button", class: "stepper-btn", "aria-label": "One page forward", onclick: () => step(1) }, icon("plus")))),
                    preview,
                    total ? null : h("p", { class: "hint" }, "Add the book's total pages in Edit details to see your percentage.")))
        ),
        initialFocus: note,
        async onSubmit({ setError }) {
            const n = Number(page.value);
            const text = note.value.trim();
            if (!Number.isInteger(n) || n < 0) return setError("The page must be a whole number."), false;
            if (total && n > total) return setError(`This book has ${fmt.num(total)} pages.`), false;
            if (!date.value) return setError("Pick the date you read."), false;
            if (date.value > today()) return setError("The date can't be in the future."), false;
            if (n === book.currentPage && !text) return setError("Move your page on or write a note to save an entry."), false;

            const before = book.status;
            await updateBook(book.id, { currentPage: n }, { session: { date: date.value, note: text } });
            const after = getBook(book.id)?.status;
            toast(after === "Read" && before !== "Read" ? "Finished! Time to write your review 🎉" : "Saved to your journal");
        }
    });
}
