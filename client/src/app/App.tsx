import { useEffect } from "react";
import { useHashRoute } from "./useHashRoute";
import { ROUTES, REDIRECTS, isRouteName, type RouteName } from "./routes";
import { TopNav } from "./TopNav";
import { openAddBook, openLogReading } from "./actions";
import { DialogHost } from "../components/Modal";
import { ToastHost, toast } from "../components/Toast";
import { LoadingSkeleton } from "../components/BookBits";
import { getState, loadAll } from "../store/store";
import { useStore } from "../store/useStore";
import { syncTheme } from "../features/theme/theme";
import { LibraryPage } from "../features/library/LibraryPage";
import { BookPage } from "../features/book/BookPage";
import { PhysicalPage } from "../features/physical/PhysicalPage";
import { AuthorPage, AuthorsPage } from "../features/authors/AuthorsPages";
import { SeriesIndexPage, SeriesPage } from "../features/series/SeriesPages";
import { findAuthor, findSeries } from "../domain/shelf";
import type { HashRoute } from "./useHashRoute";

// Start-up work runs once per page load (React runs effects twice in development).
let booted = false;

export function App() {
    const route = useHashRoute();
    const name: RouteName = isRouteName(route.name) ? route.name : "dashboard";
    const { tab } = ROUTES[name];
    const title = usePageTitle(name, route);

    // Boot: old and empty links go to their current page, then load everything once.
    useEffect(() => {
        if (booted) return;
        booted = true;
        const target = REDIRECTS[location.hash];
        if (target) {
            history.replaceState(null, "", target);
            dispatchEvent(new HashChangeEvent("hashchange"));
        }
        loadAll().catch((error) => {
            if (error.status !== 401) toast("Couldn't load your library", { error: true });
        });
        syncTheme();
    }, []);

    useEffect(() => {
        document.title = `${title} · MyBookShelf`;
    }, [title]);

    // A new page starts at the top.
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [name, route.id]);

    // "n" adds a book and "l" logs your reading, from anywhere (outside text fields and dialogs).
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if ((event.target as Element | null)?.closest?.("input, textarea, select, dialog[open]")) return;
            if (event.key === "n") {
                event.preventDefault();
                openAddBook();
            } else if (event.key === "l" && getState().loaded) {
                event.preventDefault();
                openLogReading();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, []);

    return (
        <>
            <TopNav activeTab={tab} />
            <main id="view" className="page" tabIndex={-1}>
                <View name={name} route={route} title={title} />
            </main>
            <ToastHost />
            <DialogHost />
        </>
    );
}

// Pages about one book, author or series use its name as the browser tab title (as the vanilla app does).
function usePageTitle(name: RouteName, route: HashRoute): string {
    const named = useStore((s) => {
        if (name === "book") return s.books.find((b) => b.id === String(route.id))?.title;
        if (name === "author") return findAuthorName(s.books, route.id);
        if (name === "series" && route.id !== undefined) return findSeriesName(s.books, route.id);
        return undefined;
    });
    return named || ROUTES[name].title;
}

// Strings (not objects), so the title only re-renders when the name changes.
const findAuthorName = (books: Parameters<typeof findAuthor>[0], id: string | undefined) => findAuthor(books, id || "")?.name;
const findSeriesName = (books: Parameters<typeof findSeries>[0], id: string) => findSeries(books, id)?.name;

function View({ name, route, title }: { name: RouteName; route: HashRoute; title: string }) {
    const loaded = useStore((s) => s.loaded);
    const loadError = useStore((s) => s.loadError);

    if (loadError) {
        return (
            <div className="card empty">
                <h3>Couldn't load your library</h3>
                <p>{loadError}</p>
                <button className="btn" type="button" onClick={() => location.reload()}>Try again</button>
            </div>
        );
    }
    if (!loaded) return <LoadingSkeleton />;
    switch (name) {
        case "library": return <LibraryPage params={route.params} />;
        case "book": return <BookPage key={route.id} id={route.id} />;
        case "physical": return <PhysicalPage />;
        case "authors": return <AuthorsPage />;
        case "author": return <AuthorPage name={route.id || ""} />;
        case "series": return route.id !== undefined ? <SeriesPage name={route.id} /> : <SeriesIndexPage />;
        default: return <NotMigrated title={title} />;
    }
}

// Placeholder for pages that haven't moved to React yet (removed page by page).
function NotMigrated({ title }: { title: string }) {
    return (
        <div className="card empty">
            <h3>{title}</h3>
            <p>This page hasn't moved to React yet.</p>
        </div>
    );
}
