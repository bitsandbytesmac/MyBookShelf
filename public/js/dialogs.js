// Add book (Google Books search or manual), Edit details, and Review dialogs.
import { api } from "./api.js";
import {
    state, createBook, updateBook, genreOptions, percent, findSeries, seriesChoicesFor, seriesHasRoom, canonicalSeriesName,
    STATUSES, FORMATS, OWNERSHIP, GENRES, AGE_CATEGORIES
} from "./store.js";
import { h, icon, cover, progressBar, rateInput, multiSelect, modal, toast, stripHtml, fmt } from "./ui.js";

const MAX_PICK_BYTES = 20 * 1024 * 1024;  // what you can choose (it gets shrunk before upload)
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // what the server accepts
const COVER_MAX_W = 600;
const COVER_MAX_H = 900;

// Resize to at most 600×900 and re-encode as WebP (JPEG if the browser can't), so covers are
// typically 30–150 KB. Falls back to the original file if anything goes wrong.
async function shrinkCover(file) {
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        const scale = Math.min(1, COVER_MAX_W / bitmap.width, COVER_MAX_H / bitmap.height);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const encode = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
        let blob = await encode("image/webp");
        if (!blob || blob.type !== "image/webp") blob = await encode("image/jpeg");
        if (!blob || (scale === 1 && blob.size >= file.size)) return file;
        return new File([blob], `cover.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
    } catch {
        return file;
    }
}

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

// Reuse the existing spelling of a series ("  acotar " typed vs "ACOTAR" saved) so books group together
// and no near-duplicate series is ever created.
function matchSeriesName(name) {
    return canonicalSeriesName(name);
}

const seriesCount = (s) => (s.total ? `${s.onShelf}/${s.total} books` : fmt.plural(s.onShelf, "book"));

// Series name as a searchable dropdown (ARIA combobox). It lists the series that can still take a book
// (store.seriesChoicesFor: not Completed, and a place left if "Books in series" is set), plus the book's own
// series. Typing a name that isn't a series yet offers "Create series"; the series exists once the book is saved.
// Then Book # and "Books in series" (picking a series you track fills in its total unless you typed one).
function seriesFields(book, prefix) {
    const inputId = `${prefix}Series`;
    const listId = `${prefix}SeriesOptions`;
    const hintId = `${prefix}SeriesHint`;
    const choices = seriesChoicesFor(book);

    const nameInput = h("input", {
        class: "input", id: inputId, value: book.series || "", autocomplete: "off", maxlength: 200,
        placeholder: "Pick a series or type a new one", role: "combobox",
        "aria-autocomplete": "list", "aria-expanded": "false", "aria-controls": listId, "aria-describedby": hintId
    });
    const list = h("ul", { class: "combo-list", id: listId, role: "listbox", "aria-label": "Series suggestions", hidden: true });
    const hint = h("p", { class: "hint combo-hint", id: hintId, "aria-live": "polite" });
    const totalInput = h("input", { class: "input", id: `${prefix}SeriesTotal`, type: "number", min: 1, max: 999, step: 1, inputmode: "numeric", value: book.seriesTotal ?? "" });

    let typedTotal = false;
    totalInput.addEventListener("input", () => (typedTotal = true));
    const fillTotal = () => {
        if (!typedTotal) totalInput.value = findSeries(nameInput.value)?.total ?? "";
    };

    let options = [];   // [{ id, name, label, create }]
    let active = -1;

    function updateHint() {
        const typed = nameInput.value.trim();
        const existing = typed ? findSeries(typed) : null;
        const isCurrent = existing && book.series && existing.key === findSeries(book.series)?.key;
        if (!typed) hint.textContent = "Leave blank if it's a standalone.";
        else if (!existing) hint.textContent = `New series: “${canonicalSeriesName(typed)}” is created when you save.`;
        else if (!isCurrent && !seriesHasRoom(existing)) {
            hint.textContent = existing.status === "Completed"
                ? `“${existing.name}” is completed. This book will still be added to it.`
                : `“${existing.name}” already has all ${existing.total} books. This book will still be added to it.`;
        } else hint.textContent = `${existing.name} · ${seriesCount(existing)}`;
    }

    function setActive(i) {
        active = i;
        [...list.children].forEach((li, n) => li.setAttribute("aria-selected", String(n === i)));
        if (i >= 0 && list.children[i]) {
            nameInput.setAttribute("aria-activedescendant", list.children[i].id);
            list.children[i].scrollIntoView({ block: "nearest" });
        } else nameInput.removeAttribute("aria-activedescendant");
    }

    function close() {
        list.hidden = true;
        nameInput.setAttribute("aria-expanded", "false");
        setActive(-1);
    }

    // filter: narrow the list to what's typed (while typing). Focusing or clicking shows every choice.
    function open({ filter = false } = {}) {
        const typed = nameInput.value.trim().replace(/\s+/g, " ");
        const needle = filter ? typed.toLowerCase() : "";
        const matches = choices.filter((c) => !needle || c.name.toLowerCase().includes(needle));
        options = matches.map((c, i) => ({ id: `${listId}-${i}`, name: c.name, label: c.name, count: seriesCount(c) }));
        // A name that isn't a series yet (in any spelling) can be created right here.
        if (filter && typed && !findSeries(typed)) options.push({ id: `${listId}-new`, name: typed, label: `Create series “${typed}”`, create: true });

        list.replaceChildren(...options.map((o) => h("li", {
            id: o.id, role: "option", "aria-selected": "false", class: `combo-option${o.create ? " is-create" : ""}`,
            // mousedown, not click: keep focus in the input so the list doesn't close first
            onmousedown: (event) => { event.preventDefault(); choose(o); }
        }, h("span", { class: "combo-name" }, o.label), o.count ? h("span", { class: "combo-count" }, o.count) : null)));
        if (!options.length) {
            list.append(h("li", { class: "combo-empty", role: "presentation" },
                choices.length ? "No open series match. Type a name to create one." : "No open series yet. Type a name to create one."));
        }
        list.hidden = false;
        nameInput.setAttribute("aria-expanded", "true");
        setActive(-1);
    }

    function choose(option) {
        nameInput.value = option.create ? canonicalSeriesName(option.name) : option.name;
        fillTotal();
        updateHint();
        close();
    }

    nameInput.addEventListener("focus", () => open());
    nameInput.addEventListener("click", () => list.hidden && open());
    nameInput.addEventListener("input", () => { fillTotal(); updateHint(); open({ filter: true }); });
    nameInput.addEventListener("blur", close);
    nameInput.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (list.hidden) open();
            if (!options.length) return;
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActive(active < 0 ? (step > 0 ? 0 : options.length - 1) : (active + step + options.length) % options.length);
        } else if (event.key === "Enter" && !list.hidden && active >= 0) {
            event.preventDefault(); // pick the option instead of submitting the form
            choose(options[active]);
        } else if (event.key === "Escape" && !list.hidden) {
            event.preventDefault(); // close the list, not the dialog
            event.stopPropagation();
            close();
        } else if (event.key === "Tab") {
            close();
        }
    });
    updateHint();

    return h("div", { class: "field-row series-fields" },
        h("div", { class: "field combo" },
            h("label", { for: inputId }, "Series"),
            nameInput,
            list,
            hint
        ),
        h("div", { class: "field" },
            h("label", { for: `${prefix}SeriesNo` }, "Book #"),
            h("input", { class: "input", id: `${prefix}SeriesNo`, type: "number", min: 0, step: "any", inputmode: "decimal", value: book.seriesNumber ?? "" })
        ),
        h("div", { class: "field" },
            h("label", { for: `${prefix}SeriesTotal` }, "Books in series"),
            totalInput
        )
    );
}

// Reads + validates the series fields. Returns { series, seriesNumber, seriesTotal } or { error }.
function readSeries(body, prefix) {
    const series = matchSeriesName(body.querySelector(`#${prefix}Series`).value);
    const raw = body.querySelector(`#${prefix}SeriesNo`).value.trim();
    const rawTotal = body.querySelector(`#${prefix}SeriesTotal`).value.trim();
    const seriesNumber = raw === "" ? null : Number(raw);
    const seriesTotal = rawTotal === "" ? null : Number(rawTotal);
    if (seriesNumber !== null && (!Number.isFinite(seriesNumber) || seriesNumber <= 0)) return { error: "Book # must be a positive number, like 1, 2 or 1.5." };
    if (seriesNumber !== null && !series) return { error: "Add the series name, or clear the book number." };
    if (seriesTotal !== null && (!Number.isInteger(seriesTotal) || seriesTotal < 1 || seriesTotal > 999)) return { error: "Books in series must be a whole number from 1 to 999." };
    if (seriesTotal !== null && !series) return { error: "Add the series name, or clear the number of books in it." };
    return { series, seriesNumber: series ? seriesNumber : null, seriesTotal: series ? seriesTotal : null };
}

// A labelled checkbox, e.g. "Review written".
function checkbox(id, label, checked, hint) {
    return h("label", { class: "check", for: id },
        h("input", { type: "checkbox", id, checked: Boolean(checked) }),
        h("span", {}, label, hint ? h("small", {}, hint) : null)
    );
}

// Long pill lists fold away so the form stays short.
function foldout(label, select, count) {
    const summary = h("summary", {}, label, h("span", { class: "fold-count" }, count ? `${count} selected` : ""));
    const box = h("details", { class: "foldout" }, summary, h("div", { class: "foldout-body" }, select.el));
    // Refresh the count after the pill/Add handlers inside have run.
    const recount = () => queueMicrotask(() => {
        const n = select.value.length;
        summary.lastChild.textContent = n ? `${n} selected` : "";
    });
    box.addEventListener("click", recount);
    box.addEventListener("keydown", recount);
    return box;
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
        if (file.size > MAX_PICK_BYTES) {
            toast("That image is over 20 MB.", { error: true });
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
                h("span", { class: "hint" }, "JPG, PNG or WEBP, up to 20 MB (resized automatically)")
            )
        ),
        // Uploads the chosen file (if any) and returns the cover URL to save.
        async resolve() {
            if (!pendingFile) return book.coverUrl || null;
            const small = await shrinkCover(pendingFile);
            if (small.size > MAX_UPLOAD_BYTES) throw new Error("That image is too large to upload. Try a smaller one.");
            return api.uploadCover(small);
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

// "A Court of Mist and Fury (A Court of Thorns and Roses, Book 2)" or "Catching Fire (The Hunger Games #2)"
// -> title without the bracket, plus the series name and number.
export function splitSeriesFromTitle(rawTitle = "") {
    const m = rawTitle.match(/^(.*\S)\s*\(([^()]+?)[,\s]\s*(?:Book|Bk\.?|Vol\.?|Volume|#)\s*(\d+(?:\.\d+)?)\)\s*$/i);
    if (!m) return { title: rawTitle, series: "", seriesNumber: null };
    return { title: m[1], series: m[2].replace(/[,\s]+$/, "").trim(), seriesNumber: Number(m[3]) };
}

function fromGoogle(item) {
    const info = item.volumeInfo || {};
    const thumb = (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || "")
        .replace(/^http:/, "https:")
        .replace("&edge=curl", "");
    const { title, series, seriesNumber } = splitSeriesFromTitle(info.title || "Untitled");
    return {
        title: info.subtitle ? `${title}: ${info.subtitle}` : title,
        series: matchSeriesName(series),
        seriesNumber: series ? seriesNumber : null,
        author: info.authors?.join(", ") || "Unknown author",
        coverUrl: thumb || null,
        summary: stripHtml(info.description || ""),
        totalPages: info.pageCount || 0,
        genres: genresFromCategories(info.categories),
        year: info.publishedDate?.slice(0, 4) || "",
        publishedYear: /^\d{4}$/.test(info.publishedDate?.slice(0, 4) || "") ? Number(info.publishedDate.slice(0, 4)) : null
    };
}

// For other modules (challenge discovery): a Google Books result as a book to add.
export function bookFromGoogle(item) {
    const { year, ...book } = fromGoogle(item);
    void year;
    return book;
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
                data.series ? h("span", { class: "meta" }, `${data.series}${data.seriesNumber ? ` #${data.seriesNumber}` : ""}`) : null,
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
        seriesFields({}, "m"),
        h("div", { class: "field" }, h("label", { for: "mSummary" }, "Summary"),
            h("textarea", { class: "textarea", id: "mSummary", rows: 4, placeholder: "What's it about?" })),
        textField("mPages", "Total pages", "", { type: "number", min: 0, inputmode: "numeric" }),
        checkbox("mPhysical", "Physical book", false, "Shows it in Physical Books")
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
            const series = readSeries(body, "m");
            if (series.error) return setError(series.error), false;

            await addAndOpen({
                title, author,
                series: series.series, seriesNumber: series.seriesNumber, seriesTotal: series.seriesTotal,
                summary: body.querySelector("#mSummary").value.trim(),
                totalPages: pages,
                isPhysical: body.querySelector("#mPhysical").checked,
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
    const tropes = multiSelect({ options: genreOptions("tropes"), selected: book.tropes, label: "Tropes", placeholder: "Other trope" });
    const warnings = multiSelect({ options: genreOptions("contentWarnings"), selected: book.contentWarnings, label: "Content warnings", placeholder: "Other warning" });
    // Themes, setting and characters are what smart challenges match on (with genres and tropes).
    const themes = multiSelect({ options: genreOptions("themes"), selected: book.themes, label: "Themes & keywords", placeholder: "Other theme or keyword" });
    const settings = multiSelect({ options: genreOptions("settings"), selected: book.settings, label: "Setting", placeholder: "Other place or time" });
    const characters = multiSelect({ options: genreOptions("characters"), selected: book.characters, label: "Characters", placeholder: "Other character type" });
    const year = h("input", { class: "input", id: "eYear", type: "number", min: 0, max: 2200, inputmode: "numeric", value: book.publishedYear ?? "", placeholder: "e.g. 2015" });

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
        seriesFields(book, "e"),
        h("div", { class: "field" }, h("label", { for: "eSummary" }, "Summary"),
            h("textarea", { class: "textarea", id: "eSummary", rows: 5 }, book.summary)),
        h("div", { class: "field-row-3" },
            selectField("eStatus", "Book status", STATUSES, book.status),
            selectField("eFormat", "Format", FORMATS, book.format, { blank: "—" }),
            selectField("eOwnership", "Status", OWNERSHIP, book.ownership, { blank: "—" })
        ),
        checkbox("ePhysical", "Physical book", book.isPhysical, "Shows it in Physical Books"),
        h("div", { class: "field-row" },
            h("div", { class: "field" }, h("label", { for: "eTotal" }, "Total pages"), total),
            h("div", { class: "field" }, h("label", { for: "eCurrent" }, "Page I'm on"), current)
        ),
        h("div", { class: "field" }, h("span", { class: "label" }, "Progress"), preview),
        h("div", { class: "field-row" },
            selectField("eAge", "Age category", AGE_CATEGORIES, book.ageCategory, { blank: "—" }),
            h("div", { class: "field" }, h("label", { for: "eYear" }, "Published year"), year)
        ),
        foldout("Genres", genres, book.genres.length),
        foldout("Sub-genres", subgenres, book.subgenres.length),
        foldout("Tropes", tropes, book.tropes.length),
        foldout("Themes & keywords", themes, book.themes.length),
        foldout("Setting", settings, book.settings.length),
        foldout("Characters", characters, book.characters.length),
        foldout("Trigger / content warnings", warnings, book.contentWarnings.length),
        h("p", { class: "hint" }, "Genres, tropes, themes, setting and characters are what your challenges match books on.")
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
            const series = readSeries(body, "e");
            if (series.error) return setError(series.error), false;
            const publishedYear = year.value.trim() === "" ? null : Number(year.value);
            if (publishedYear !== null && (!Number.isInteger(publishedYear) || publishedYear < 0 || publishedYear > 2200)) {
                return setError("Published year must be a year like 1999."), false;
            }

            await updateBook(book.id, {
                title, author,
                series: series.series, seriesNumber: series.seriesNumber, seriesTotal: series.seriesTotal,
                summary: body.querySelector("#eSummary").value.trim(),
                status: body.querySelector("#eStatus").value,
                format: body.querySelector("#eFormat").value,
                ownership: body.querySelector("#eOwnership").value,
                isPhysical: body.querySelector("#ePhysical").checked,
                ageCategory: body.querySelector("#eAge").value,
                totalPages, currentPage,
                genres: genres.value,
                subgenres: subgenres.value,
                tropes: tropes.value,
                contentWarnings: warnings.value,
                themes: themes.value,
                settings: settings.value,
                characters: characters.value,
                publishedYear,
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
        h("div", { class: "field" }, h("label", { for: "rReview" }, "Review"), reviewText),
        h("div", { class: "field" },
            h("span", { class: "label" }, "Checklist"),
            h("div", { class: "check-row" },
                checkbox("rReviewed", "Review", book.reviewed, "Written or posted"),
                checkbox("rJournaled", "Reading journal", book.journaled, "Added to my journal"))
        )
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
                reviewed: body.querySelector("#rReviewed").checked,
                journaled: body.querySelector("#rJournaled").checked,
                dateStarted: started.value || null,
                dateFinished: finished.value || null
            });
            toast("Review saved");
        }
    });
}
