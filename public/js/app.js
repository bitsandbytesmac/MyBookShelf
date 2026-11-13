// App entry: routing, nav, account menu, initial load.
import { api, logout } from "./api.js";
import { loadAll, subscribe } from "./store.js";
import { renderDashboard, currentUser } from "./dashboard.js";
import { renderLibrary } from "./library.js";
import { renderBookPage } from "./bookPage.js";
import { renderAuthors, renderAuthor } from "./authors.js";
import { renderSeries } from "./series.js";
import { openAddBook } from "./dialogs.js";
import { h, modal, toast } from "./ui.js";
import { openCustomize, syncTheme } from "./theme.js";

const view = document.getElementById("view");

const ROUTES = {
    dashboard: { render: renderDashboard, title: () => "Dashboard", tab: "dashboard" },
    library: { render: renderLibrary, title: () => "Library", tab: "library" },
    book: { render: renderBookPage, title: () => document.querySelector(".book-hero h1")?.textContent || "Book", tab: "library" },
    authors: { render: renderAuthors, title: () => "Authors", tab: "authors" },
    author: { render: renderAuthor, title: () => document.querySelector(".author-hero h1")?.textContent || "Author", tab: "authors" },
    series: { render: renderSeries, title: () => document.querySelector(".series-hero h1")?.textContent || "Series", tab: "series" }
};

let currentKey = null;

function parseHash() {
    const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
    const [name, id] = path.split("/");
    return { name: ROUTES[name] ? name : "dashboard", id, params: new URLSearchParams(query) };
}

function render({ scroll = false } = {}) {
    const { name, id, params } = parseHash();
    const route = ROUTES[name];

    // Keep focus/caret in the library search box across data re-renders.
    const active = document.activeElement;
    const keepSearch = !scroll && active?.matches?.(".search input");
    const caret = keepSearch ? active.selectionStart : null;
    const scrollY = window.scrollY;

    view.replaceChildren(route.render(params, id));
    document.title = `${route.title()} · MyBookShelf`;

    document.querySelectorAll(".tab").forEach((tab) => {
        const on = tab.dataset.route === route.tab;
        tab.classList.toggle("active", on);
        if (on) tab.setAttribute("aria-current", "page");
        else tab.removeAttribute("aria-current");
    });

    if (keepSearch) {
        const input = view.querySelector(".search input");
        input?.focus();
        input?.setSelectionRange(caret, caret);
    }

    if (scroll) window.scrollTo(0, 0);
    else window.scrollTo(0, scrollY);

    currentKey = `${name}/${id || ""}`;
}

window.addEventListener("hashchange", () => {
    const { name, id } = parseHash();
    render({ scroll: `${name}/${id || ""}` !== currentKey });
});

subscribe(() => render());

// ---------- Nav actions ----------

document.querySelectorAll("[data-action='add-book']").forEach((btn) => btn.addEventListener("click", openAddBook));

// "n" adds a book from anywhere (outside text fields).
document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target.closest("input, textarea, select, dialog[open]")) return;
    if (event.key === "n") {
        event.preventDefault();
        openAddBook();
    }
});

// ---------- Account menu ----------

const user = currentUser();
const avatarBtn = document.getElementById("avatarBtn");
const menuPanel = document.getElementById("menuPanel");

avatarBtn.textContent = (user.username || user.email || "?").trim().charAt(0).toUpperCase();
document.getElementById("menuName").textContent = user.username || "Reader";
document.getElementById("menuEmail").textContent = user.email || "";

function setMenu(open) {
    menuPanel.classList.toggle("hidden", !open);
    avatarBtn.setAttribute("aria-expanded", String(open));
}
avatarBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    setMenu(menuPanel.classList.contains("hidden"));
});
document.addEventListener("click", (event) => {
    if (!event.target.closest(".menu")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setMenu(false);
});
document.getElementById("logoutBtn").addEventListener("click", () => logout());

document.getElementById("customizeBtn").addEventListener("click", () => {
    setMenu(false);
    openCustomize();
});

document.getElementById("deleteAccountBtn").addEventListener("click", () => {
    setMenu(false);
    const password = h("input", { class: "input", type: "password", id: "deletePassword", autocomplete: "current-password", required: true });

    modal({
        title: "Delete your account?",
        size: "sm",
        danger: true,
        submitLabel: "Delete forever",
        busyLabel: "Deleting…",
        body: h("div", { class: "stack" },
            h("p", {}, "This permanently deletes your account and everything in it: every book, note, review, quote, reading goal and uploaded cover. It can't be undone."),
            h("div", { class: "field" },
                h("label", { for: "deletePassword" }, "Enter your password to confirm"),
                password)
        ),
        async onSubmit({ setError }) {
            if (!password.value) {
                setError("Enter your password to confirm.");
                password.focus();
                return false;
            }
            await api.deleteAccount(password.value);
            localStorage.removeItem("user");
            localStorage.removeItem("theme");
            sessionStorage.setItem("authNotice", "Your account and all your books have been deleted.");
            location.replace("/login.html");
            return false; // keep the dialog up while the page changes
        }
    });
});

// ---------- Boot ----------

if (!location.hash || location.hash === "#/home" || location.hash === "#/stats") history.replaceState(null, "", "#/dashboard");
render({ scroll: true });

syncTheme();

loadAll().catch((error) => {
    if (error.status === 401) return;
    console.error(error);
    view.replaceChildren(
        h("div", { class: "card empty" },
            h("h3", {}, "Couldn't load your library"),
            h("p", {}, error.message),
            h("button", { class: "btn", type: "button", onclick: () => location.reload() }, "Try again")
        )
    );
    toast("Couldn't load your library", { error: true });
});
