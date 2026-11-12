// Add book (Google Books search or manual), Edit details, and Review dialogs.
import { api } from "./api.js";
import {
    state, createBook, updateBook, genreOptions, percent,
    STATUSES, FORMATS, OWNERSHIP, GENRES
} from "./store.js";
import { h, icon, cover, progressBar, rateInput, multiSelect, modal, toast, stripHtml, fmt } from "./ui.js";

const MAX_COVER_BYTES = 5 * 1024 * 1024;

const sameBook = (a, b) =>
    a.title.trim().toLowerCase() === b.title.trim().toLowerCase() &&
    a.author.trim().toLowerCase() === b.author.trim().toLowerCase();

function selectField(id, label, options, value, { blank } = {}) {
    return h("div", { class: "field" },
        h("label", { for: id }, label),
        h("select", { class: "select", id },
            blank ? h("option", { value: "" }, blank) : null,
            options.map((o) => h("option", { value: o, selected: o === value }, o))
        )
    );
}

function textField(id, label, value = "", attrs = {}) {
    return h("div", { class: "field" }, h("label", { for: id }, label), h("input", { class: "input", id, value, autocomplete: "off", ...attrs }));
}

// ---------- Cover picker (shared by manual add + edit) ----------

function coverPicker(book) {
    let pendingFile = null;
    let objectUrl = null;
    const preview = h("div", {});
    const fileInput = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", class: "sr-only", id: `cover-${Math.random().toString(36).slice(2)}` });

    const render = () => preview.replaceChildren(cover({ ...book, coverUrl: objectUrl || book.coverUrl }, "sm"));

    fileInput.addEventListener("change", () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast("Use a JPG, PNG or WEBP image.", { error: true });
            fileInput.value = "";
            return;
        }
        if (file.size > MAX_COVER_BYTES) {
            toast("That image is over 5 MB.", { error: true });
            fileInput.value = "";
            return;
        }
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        pendingFile = file;
        objectUrl = URL.createObjectURL(file);
        render();
    });

    render();

    return {
        el: h("div", { class: "cover-field" },
            preview,
            h("div", { class: "cover-actions" },
                h("label", { class: "btn btn-sm", for: fileInput.id }, book.coverUrl ? "Change cover" : "Upload cover"),
                fileInput,
                h("span", { class: "hint" }, "JPG, PNG or WEBP, up to 5 MB")
            )
        ),
        // Uploads the chosen file (if any) and returns the cover URL to save.
        async resolve() {
            return pendingFile ? api.uploadCover(pendingFile) : book.coverUrl || null;
        }
    };
}

// ======================================================================
// ADD BOOK
// ======================================================================

function genresFromCategories(categories = []) {
    const parts = categories.flatMap((c) => c.split("/").map((p) => p.trim())).filter(Boolean);
    const known = parts
        .map((p) => GENRES.find((g) => g.toLowerCase() === p.toLowerCase()))
        .filter(Boolean);
    if (known.length) return [...new Set(known)];
    return parts.length ? [parts[0]] : [];
}

function fromGoogle(item) {
    const info = item.volumeInfo || {};
    const thumb = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
        .replace(/^http:/, "https:")
        .replace("&edge=curl", "");
    return {
        title: info.subtitle ? `${info.title}: ${info.subtitle}` : info.title || "Untitled",
        author: info.authors?.join(", ") || "Unknown author",
        coverUrl: thumb || null,
        summary: stripHtml(info.description || ""),
        totalPages: info.pageCount || 0,
        genres: genresFromCategories(info.categories),
        year: info.publishedDate?.slice(0, 4) || ""
    };
}

async function addAndOpen(data) {
    const book = await createBook({ ...data, status: "To Be Read" });
    toast(`"${book.title}" added to your To Be Read`);
    location.hash = `#/book/${book.id}`;
    return book;
}

export function openAddBook() {
    const query = h("input", { class: "input", type: "search", placeholder: "Title, author or ISBN", "aria-label": "Search Google Books", autocomplete: "off" });
    const searchBtn = h("button", { type: "button", class: "btn btn-primary" }, icon("search"), "Search");
    const status = h("p", { class: "search-status", "aria-live": "polite" }, "Search Google Books — the cover, author and summary fill in automatically.");
    const results = h("div", { class: "search-results" });
    let token = 0;

    const run = async () => {
        const q = query.value.trim();
        if (!q) {
            query.focus();
            return;
        }
        const mine = ++token;
        searchBtn.disabled = true;
        status.textContent = "Searching…";
        results.replaceChildren();
        try {
            const items = await api.searchGoogleBooks(q);
            if (mine !== token) return;
            if (!items.length) {
                status.textContent = "No matches. Try different words, or add it manually.";
                return;
            }
            status.textContent = "";
            results.replaceChildren(...items.map((item) => resultRow(fromGoogle(item))));
        } catch (error) {
            if (mine === token) status.textContent = error.message;
        } finally {
            if (mine === token) searchBtn.disabled = false;
        }
    };

    const resultRow = (data) => {
        const owned = state.books.some((b) => sameBook(b, data));
        const addBtn = h("button", { type: "button", class: "btn btn-sm btn-primary", disabled: owned }, owned ? "On your shelf" : "Add");
        addBtn.addEventListener("click", async () => {
            addBtn.disabled = true;
            addBtn.textContent = "Adding…";
            try {
                await addAndOpen(data);
                m.close();
            } catch (error) {
                toast(error.message, { error: true });
                addBtn.disabled = false;
                addBtn.textContent = "Add";
            }
        });

        return h("div", { class: "search-result" },
            cover(data, "xs"),
            h("div", {},
                h("strong", {}, data.title),
                h("span", { class: "meta" }, [data.author, data.year, data.totalPages ? `${data.totalPages} pages` : null].filter(Boolean).join(" · ")),
                data.summary ? h("p", { class: "blurb" }, data.summary) : null
            ),
            addBtn
        );
    };

    searchBtn.addEventListener("click", run);
    query.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            run();
        }
    });

    const manualBtn = h("button", { type: "button", class: "link-btn left" }, "Can't find it? Add manually");
    manualBtn.addEventListener("click", () => {
        m.close();
        openManualAdd(query.value.trim());
    });

    const m = modal({
        title: "Add a book",
        body: h("div", { style: { display: "flex", flexDirection: "column", gap: "14px" } },
            h("div", { class: "search-row" }, query, searchBtn), status, results),
        footer: [manualBtn],
        initialFocus: query
    });
}

function openManualAdd(prefillTitle = "") {
    const draft = { title: prefillTitle, author: "", coverUrl: null };
    const picker = coverPicker(draft);
    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "16px" } },
        picker.el,
        textField("mTitle", "Title", prefillTitle, { required: true }),
        textField("mAuthor", "Author", "", { required: true }),
        h("div", { class: "field" }, h("label", { for: "mSummary" }, "Summary"),
            h("textarea", { class: "textarea", id: "mSummary", rows: 4, placeholder: "What's it about?" })),
        textField("mPages", "Total pages", "", { type: "number", min: 0, inputmode: "numeric" })
    );

    modal({
        title: "Add a book manually",
        body,
        submitLabel: "Add to To Be Read",
        onSubmit: async ({ setError }) => {
            const title = body.querySelector("#mTitle").value.trim();
            const author = body.querySelector("#mAuthor").value.trim();
            const pages = Number(body.querySelector("#mPages").value || 0);
            if (!title) return setError("Add a title."), false;
            if (!author) return setError("Add an author."), false;
            if (!Number.isInteger(pages) || pages < 0) return setError("Total pages must be a whole number."), false;
            if (state.books.some((b) => sameBook(b, { title, author }))) return setError("That book is already on your shelf."), false;

            await addAndOpen({
                title, author,
                summary: body.querySelector("#mSummary").value.trim(),
                totalPages: pages,
                coverUrl: await picker.resolve()
            });
        }
    });
}

// ======================================================================
// EDIT DETAILS
// ======================================================================

export function openEditBook(book) {
    const picker = coverPicker(book);
    const genres = multiSelect({ options: genreOptions("genres"), selected: book.genres, label: "Genres", placeholder: "Other genre" });
    const subgenres = multiSelect({ options: genreOptions("subgenres"), selected: book.subgenres, label: "Sub-genres", placeholder: "Other sub-genre" });

    const total = h("input", { class: "input", id: "eTotal", type: "number", min: 0, inputmode: "numeric", value: book.totalPages || "" });
    const current = h("input", { class: "input", id: "eCurrent", type: "number", min: 0, inputmode: "numeric", value: book.currentPage || "" });
    const preview = h("div", { class: "progress-preview" });
    const updatePreview = () => {
        const pct = percent({ totalPages: Number(total.value) || 0, currentPage: Number(current.value) || 0, status: "" });
        preview.replaceChildren(progressBar(pct), `${pct}%`);
    };
    total.addEventListener("input", updatePreview);
    current.addEventListener("input", updatePreview);
    updatePreview();

    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "18px" } },
        picker.el,
        textField("eTitle", "Title", book.title),
        textField("eAuthor", "Author", book.author),
        h("div", { class: "field" }, h("label", { for: "eSummary" }, "Summary"),
            h("textarea", { class: "textarea", id: "eSummary", rows: 5 }, book.summary)),
        h("div", { class: "field-row-3" },
            selectField("eStatus", "Book status", STATUSES, book.status),
            selectField("eFormat", "Format", FORMATS, book.format, { blank: "—" }),
            selectField("eOwnership", "Status", OWNERSHIP, book.ownership, { blank: "—" })
        ),
        h("div", { class: "field-row" },
            h("div", { class: "field" }, h("label", { for: "eTotal" }, "Total pages"), total),
            h("div", { class: "field" }, h("label", { for: "eCurrent" }, "Page I'm on"), current)
        ),
        h("div", { class: "field" }, h("span", { class: "label" }, "Progress"), preview),
        h("div", { class: "field" }, h("span", { class: "label" }, "Genres"), genres.el),
        h("div", { class: "field" }, h("span", { class: "label" }, "Sub-genres"), subgenres.el)
    );

    modal({
        title: "Edit details",
        body,
        submitLabel: "Save changes",
        onSubmit: async ({ setError }) => {
            const title = body.querySelector("#eTitle").value.trim();
            const author = body.querySelector("#eAuthor").value.trim();
            const totalPages = Number(total.value || 0);
            const currentPage = Number(current.value || 0);

            if (!title) return setError("Add a title."), false;
            if (!author) return setError("Add an author."), false;
            if (!Number.isInteger(totalPages) || totalPages < 0) return setError("Total pages must be a whole number."), false;
            if (!Number.isInteger(currentPage) || currentPage < 0) return setError("Current page must be a whole number."), false;
            if (totalPages > 0 && currentPage > totalPages) return setError("The page you're on can't be past the last page."), false;
            if (!totalPages && currentPage) return setError("Add total pages to track progress."), false;

            await updateBook(book.id, {
                title, author,
                summary: body.querySelector("#eSummary").value.trim(),
                status: body.querySelector("#eStatus").value,
                format: body.querySelector("#eFormat").value,
                ownership: body.querySelector("#eOwnership").value,
                totalPages, currentPage,
                genres: genres.value,
                subgenres: subgenres.value,
                coverUrl: await picker.resolve()
            });
            toast("Details saved");
        }
    });
}

// ======================================================================
// REVIEW
// ======================================================================

export function openReview(book) {
    const rating = rateInput({ kind: "star", value: book.rating, label: "Rating" });
    const spice = rateInput({ kind: "chili", value: book.spice, label: "Spice level" });
    const quotes = [...book.quotes];

    const quoteList = h("div", { class: "quote-list" });
    const renderQuotes = () => {
        quoteList.replaceChildren(...quotes.map((q, i) =>
            h("div", { class: "quote-item" },
                h("span", {}, q),
                h("button", {
                    type: "button", class: "icon-btn", "aria-label": "Remove quote",
                    onclick: () => {
                        quotes.splice(i, 1);
                        renderQuotes();
                    }
                }, icon("close"))
            )
        ));
    };
    renderQuotes();

    const quoteInput = h("textarea", { class: "textarea", rows: 2, placeholder: "Type a line you loved…", "aria-label": "New quote", maxlength: 2000 });
    const addQuote = () => {
        const text = quoteInput.value.trim();
        if (!text) return;
        quotes.push(text);
        quoteInput.value = "";
        renderQuotes();
        quoteInput.focus();
    };

    const started = h("input", { class: "input", type: "date", id: "rStarted", value: book.dateStarted || "" });
    const finished = h("input", { class: "input", type: "date", id: "rFinished", value: book.dateFinished || "" });
    const reviewText = h("textarea", { class: "textarea", id: "rReview", rows: 6, placeholder: "What did you think? How did it make you feel?" }, book.review);

    const body = h("div", { style: { display: "flex", flexDirection: "column", gap: "20px" } },
        h("div", { class: "field-row" },
            h("div", { class: "field" }, h("span", { class: "label" }, "Rating"), rating.el),
            h("div", { class: "field" }, h("span", { class: "label" }, "Spice"), spice.el)
        ),
        h("div", { class: "field-row" },
            h("div", { class: "field" }, h("label", { for: "rStarted" }, "Date started"), started),
            h("div", { class: "field" }, h("label", { for: "rFinished" }, "Date finished"), finished)
        ),
        h("div", { class: "field" },
            h("span", { class: "label" }, "Favourite quotes"),
            h("span", { class: "hint" }, "These show up on your dashboard."),
            quoteList,
            h("div", { class: "quote-add" }, quoteInput, h("button", { type: "button", class: "btn btn-sm", onclick: addQuote }, icon("plus"), "Add"))
        ),
        h("div", { class: "field" }, h("label", { for: "rReview" }, "Review"), reviewText)
    );

    modal({
        title: `Review · ${book.title}`,
        body,
        submitLabel: "Save review",
        initialFocus: reviewText,
        onSubmit: async ({ setError }) => {
            // Don't lose a quote that was typed but not added yet.
            if (quoteInput.value.trim()) addQuote();

            if (started.value && finished.value && finished.value < started.value) {
                return setError("Date finished can't be before date started."), false;
            }

            await updateBook(book.id, {
                rating: rating.value,
                spice: spice.value,
                quotes,
                review: reviewText.value.trim(),
                dateStarted: started.value || null,
                dateFinished: finished.value || null
            });
            toast("Review saved");
        }
    });
}
