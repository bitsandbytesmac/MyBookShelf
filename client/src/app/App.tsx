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

// Start-up work runs once per page load (React runs effects twice in development).
let booted = false;

export function App() {
    const route = useHashRoute();
    const name: RouteName = isRouteName(route.name) ? route.name : "dashboard";
    const { title, tab } = ROUTES[name];

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
                <View title={title} />
            </main>
            <ToastHost />
            <DialogHost />
        </>
    );
}

function View({ title }: { title: string }) {
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
    return <NotMigrated title={title} />;
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
