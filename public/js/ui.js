// Small DOM helpers and shared UI pieces. Everything builds nodes with
// textContent, so user data is never interpreted as HTML.

export function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);

    for (const [key, value] of Object.entries(props || {})) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "style" && typeof value === "object") Object.assign(node.style, value);
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key in node && typeof value !== "string") node[key] = value;
        else node.setAttribute(key, value === true ? "" : value);
    }

    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
}

// Static SVG icon markup (trusted, defined here only).
const ICONS = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    book: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.4-4.5-8.6-10-8.6z"/>',
    pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>'
};

export function icon(name, { filled = false, cls } = {}) {
    const wrap = document.createElement("span");
    wrap.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
    const svg = wrap.firstElementChild;
    if (cls) svg.setAttribute("class", cls);
    return svg;
}

// ---------- Book bits ----------

// Dark enough for white titles to pass WCAG AA (4.5:1).
const FALLBACK_COLORS = ["#ae5e5e", "#687c4b", "#a06657", "#657b53", "#a7644d", "#8f6f4e", "#8e6a7f", "#617c63"];

function hashString(text) {
    let hash = 0;
    for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return Math.abs(hash);
}

export function cover(book, size = "md") {
    const wrap = h("div", { class: `cover cover-${size}` });
    const fallback = () =>
        h("div", { class: "cover-fallback", style: { background: FALLBACK_COLORS[hashString(book.title || "") % FALLBACK_COLORS.length] } },
            h("span", { class: "cf-title" }, book.title || "Untitled"),
            h("span", { class: "cf-author" }, book.author || "")
        );

    if (book.coverUrl) {
        const img = h("img", { src: book.coverUrl, alt: "", loading: "lazy" });
        img.addEventListener("error", () => img.replaceWith(fallback()), { once: true });
        wrap.append(img);
    } else {
        wrap.append(fallback());
    }
    return wrap;
}

// ---------- Book Shelf (the Library's shelf view) ----------

// One book standing on the shelf: its cover, a heart if it's a favourite, and a progress strip while reading.
export function shelfBook(book) {
    const reading = (book.status === "Reading" || book.status === "Paused") && book.totalPages;
    const pct = reading ? Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)) : 0;
    const label = [
        book.title, book.author, book.status,
        reading ? `${pct}%` : null,
        book.status === "Read" && book.dateFinished ? `finished ${fmt.date(book.dateFinished)}` : null
    ].filter(Boolean).join(" · ");

    const node = h("a", { class: "shelf-book", href: `#/book/${book.id}`, "aria-label": label, title: label }, cover(book, "sm"));
    if (book.isFavorite) node.append(h("span", { class: "shelf-fav", "aria-hidden": "true" }, icon("heart", { filled: true })));
    if (reading) node.append(h("span", { class: "shelf-progress", "aria-hidden": "true" }, h("span", { style: { width: `${pct}%` } })));
    return node;
}

// Leafy vine with fairy lights across the top of the bookcase (decoration only, hidden from screen readers).
function shelfVine() {
    return h("div", { class: "shelf-vine", "aria-hidden": "true" },
        h("span", { class: "vine-leaves" }),
        h("span", { class: "vine-glow" }, h("span", { class: "vine-lights vine-lights-a" })),
        h("span", { class: "vine-glow" }, h("span", { class: "vine-lights vine-lights-b" })));
}

// Wooden bookcase: a plank under every row of books.
export function bookcase(books, emptyText = "Nothing on this shelf yet.") {
    return h("div", { class: `bookcase${books.length ? "" : " is-empty"}` },
        shelfVine(),
        books.length
            ? h("div", { class: "shelf", role: "list", "aria-label": "Book Shelf" },
                books.map((b) => h("div", { role: "listitem", class: "shelf-slot" }, shelfBook(b))))
            : h("div", { class: "shelf shelf-empty" }, h("p", {}, emptyText)));
}

export function progressBar(value, { thin = false } = {}) {
    return h("div", { class: `progress${thin ? " progress-thin" : ""}`, role: "progressbar", "aria-valuenow": value, "aria-valuemin": 0, "aria-valuemax": 100 },
        h("span", { style: { width: `${value}%` } })
    );
}

const STATUS_CLASS = { "To Be Read": "st-tbr", Reading: "st-reading", Read: "st-read", Paused: "st-paused", DNF: "st-dnf" };

export function statusBadge(status) {
    return h("span", { class: `badge ${STATUS_CLASS[status] || ""}` }, status);
}

// ---------- Authors & series ----------

export const authorHref = (name) => `#/author/${encodeURIComponent(name)}`;
export const seriesHref = (name) => `#/series/${encodeURIComponent(name)}`;

// "A Court of Thorns and Roses · Book 2 of 5"
export function seriesLabel(book) {
    if (!book.series) return "";
    const of = book.seriesTotal ? ` of ${book.seriesTotal}` : "";
    return book.seriesNumber ? `${book.series} · Book ${book.seriesNumber}${of}` : book.series;
}

export function initials(name) {
    const words = name.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "?";
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

export function authorAvatar(name, size = "md") {
    return h("span", {
        class: `author-avatar author-avatar-${size}`, "aria-hidden": "true",
        style: { background: FALLBACK_COLORS[hashString(name.toLowerCase()) % FALLBACK_COLORS.length] }
    }, initials(name));
}

const SERIES_STATUS_CLASS = { Completed: "st-read", "In progress": "st-reading", "Not started": "st-tbr" };
export function seriesBadge(status) {
    return h("span", { class: `badge ${SERIES_STATUS_CLASS[status] || ""}` }, status);
}

// Overlapping covers, e.g. on author and series cards.
export function coverStack(books, max = 4) {
    const shown = books.slice(0, max);
    return h("div", { class: "cover-stack", "aria-hidden": "true" },
        shown.map((b) => cover(b, "xs")),
        books.length > max ? h("span", { class: "cover-more" }, `+${books.length - max}`) : null
    );
}

export function stars(rating) {
    const wrap = h("span", { class: "stars", role: "img", "aria-label": `${rating} out of 5 stars` });
    for (let i = 1; i <= 5; i++) {
        const svg = icon("star", { filled: true });
        if (i > rating) svg.classList.add("off");
        wrap.append(svg);
    }
    return wrap;
}

export function chilis(spice) {
    const wrap = h("span", { class: "chilis", role: "img", "aria-label": `Spice ${spice} out of 5` });
    for (let i = 1; i <= 5; i++) wrap.append(h("span", { class: i > spice ? "off" : "", "aria-hidden": "true" }, "🌶️"));
    return wrap;
}

// Clickable 1–5 scale. kind: "star" | "chili". Returns { el, get value() }.
export function rateInput({ kind = "star", value = null, label, onChange } = {}) {
    let current = value;
    const el = h("div", { class: `rate-input${kind === "chili" ? " chili" : ""}`, role: "radiogroup", "aria-label": label });

    const render = () => {
        el.replaceChildren();
        for (let i = 1; i <= 5; i++) {
            el.append(h("button", {
                type: "button",
                role: "radio",
                class: current && i <= current ? "on" : "",
                "aria-checked": String(current === i),
                "aria-label": `${i} of 5`,
                onclick: () => {
                    current = i;
                    render();
                    onChange?.(current);
                }
            }, kind === "star" ? icon("star", { filled: true }) : "🌶️"));
        }
        if (current) {
            el.append(h("button", {
                type: "button", class: "link-btn clear", style: { width: "auto", height: "auto" },
                onclick: () => {
                    current = null;
                    render();
                    onChange?.(current);
                }
            }, "Clear"));
        }
    };
    render();

    return { el, get value() { return current; } };
}

// Toggle-pill multi-select with a free-text "add your own" box.
export function multiSelect({ options, selected = [], label, placeholder = "Add your own" }) {
    const chosen = new Set(selected);
    const all = [...new Set([...options, ...selected])];
    const pills = h("div", { class: "pills", role: "group", "aria-label": label });

    const render = () => {
        pills.replaceChildren(...all.map((opt) =>
            h("button", {
                type: "button", class: "pill", "aria-pressed": String(chosen.has(opt)),
                onclick: () => {
                    chosen.has(opt) ? chosen.delete(opt) : chosen.add(opt);
                    render();
                }
            }, opt)
        ));
    };

    const input = h("input", { class: "input", placeholder, "aria-label": `${label}: add your own`, maxlength: 60 });
    const add = () => {
        const value = input.value.trim();
        if (!value) return;
        const existing = all.find((o) => o.toLowerCase() === value.toLowerCase());
        if (existing) chosen.add(existing);
        else {
            all.push(value);
            chosen.add(value);
        }
        input.value = "";
        render();
    };
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            add();
        }
    });

    render();
    const el = h("div", {}, pills, h("div", { class: "pill-add" }, input, h("button", { type: "button", class: "btn btn-sm", onclick: add }, "Add")));

    // Keep the user's chosen order: defaults order first, then custom additions.
    return { el, get value() { return all.filter((o) => chosen.has(o)); } };
}

// ---------- Formatting ----------

export const fmt = {
    num: (n) => Number(n || 0).toLocaleString(),
    date(value) {
        if (!value) return "";
        const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
        return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    },
    relative(value) {
        const diff = (Date.now() - new Date(value).getTime()) / 1000;
        if (diff < 60) return "just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
        return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    },
    plural: (n, word) => `${fmt.num(n)} ${word}${n === 1 ? "" : "s"}`
};

// Google Books descriptions sometimes contain HTML; keep only the text.
export function stripHtml(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n"), "text/html");
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- Toasts ----------

export function toast(message, { error = false } = {}) {
    const container = document.getElementById("toasts");
    if (!container) return;
    const node = h("div", { class: `toast${error ? " error" : ""}`, role: error ? "alert" : "status" }, message);
    container.append(node);
    setTimeout(() => node.remove(), error ? 5000 : 2800);
}

// ---------- Dialogs ----------

// Builds a <dialog>, shows it, removes it on close.
// body: Node; footer: array of Nodes; onSubmit: async () => boolean|void (false keeps it open).
export function modal({ title, body, footer = [], size, onSubmit, submitLabel = "Save", busyLabel = "Saving…", danger = false, initialFocus }) {
    const errorEl = h("p", { class: "form-error", "aria-live": "polite" });
    const submitBtn = onSubmit ? h("button", { type: "submit", class: danger ? "btn btn-danger-solid" : "btn btn-primary" }, submitLabel) : null;

    const form = h("form", { class: "dialog-form", novalidate: true },
        h("div", { class: "dialog-head" },
            h("h2", {}, title),
            h("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: () => close() }, icon("close"))
        ),
        h("div", { class: "dialog-body" }, body, errorEl),
        (footer.length || submitBtn)
            ? h("div", { class: "dialog-foot" },
                ...footer,
                onSubmit ? h("button", { type: "button", class: "btn", onclick: () => close() }, "Cancel") : null,
                submitBtn)
            : null
    );

    const dialog = h("dialog", { class: size === "sm" ? "dialog-sm" : "", "aria-label": title }, form);

    function close() {
        if (dialog.open) dialog.close();
    }

    dialog.addEventListener("close", () => dialog.remove());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) close();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!onSubmit) return;
        errorEl.textContent = "";
        submitBtn.disabled = true;
        const label = submitBtn.textContent;
        submitBtn.textContent = busyLabel;
        try {
            const keepOpen = (await onSubmit({ setError: (m) => (errorEl.textContent = m) })) === false;
            if (!keepOpen) close();
        } catch (error) {
            errorEl.textContent = error.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = label;
        }
    });

    document.body.append(dialog);
    dialog.showModal();
    (initialFocus || form.querySelector(".dialog-body input, .dialog-body textarea, .dialog-body select"))?.focus();

    return { dialog, close, setError: (m) => (errorEl.textContent = m) };
}

export function confirmDialog({ title, text, okLabel = "Delete" }) {
    return new Promise((resolve) => {
        let answered = false;
        const ok = h("button", { type: "button", class: "btn btn-danger-solid" }, okLabel);
        const cancel = h("button", { type: "button", class: "btn" }, "Cancel");
        const m = modal({ title, size: "sm", body: h("p", {}, text), footer: [cancel, ok] });
        ok.addEventListener("click", () => { answered = true; resolve(true); m.close(); });
        cancel.addEventListener("click", () => m.close());
        m.dialog.addEventListener("close", () => { if (!answered) resolve(false); });
        cancel.focus();
    });
}

// ---------- Tooltip (for chart marks) ----------

let tip;
export function attachTooltip(node, text) {
    node.addEventListener("pointerenter", () => {
        tip ??= document.body.appendChild(h("div", { class: "tooltip", role: "tooltip" }));
        tip.textContent = text;
        tip.classList.remove("hidden");
    });
    node.addEventListener("pointermove", (event) => {
        if (!tip) return;
        const x = Math.min(event.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
        tip.style.left = `${x}px`;
        tip.style.top = `${event.clientY - tip.offsetHeight - 10}px`;
    });
    node.addEventListener("pointerleave", () => tip?.classList.add("hidden"));
}
