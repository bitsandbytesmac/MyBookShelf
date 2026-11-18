import { useEffect, useRef, useState } from "react";
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
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { StatisticsPage } from "../features/statistics/StatisticsPage";
import { ChallengeBoardPage, ChallengesIndexPage } from "../features/challenges/ChallengesPages";
import { openUnlockDialog } from "../features/challenges/ChallengeDialogs";
import { onBookFinished } from "../store/store";
import { today } from "../domain/dates";
import type { HashRoute } from "./useHashRoute";

// Start-up work runs once per page load (React runs effects twice in development).
let booted = false;

export function App() {
    const route = useHashRoute();
    const name: RouteName = isRouteName(route.name) ? route.name : "dashboard";
    const { tab } = ROUTES[name];
    const title = usePageTitle(name, route);
    const day = useDayRollover(name);

    // Boot: old and empty links go to their current page, then load everything once.
    useEffect(() => {
        if (booted) return;
        booted = true;
        const target = REDIRECTS[location.hash];
        if (target) {
            history.replaceState(null, "", target);
            dispatchEvent(new HashChangeEvent("hashchange"));
        }
        // Finishing a book anywhere (status menu, Log your reading, Edit details) offers the spots it unlocks.
        onBookFinished(openUnlockDialog);
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
                <View name={name} route={route} day={day} />
            </main>
            <ToastHost />
            <DialogHost />
        </>
    );
}

// A new day starts at local midnight. A page left open overnight redraws by itself, so the quote of the
// day, the streak and the calendars move on without a reload. Pages that show "today" are redrawn (by
// their key), but never while a dialog is open: that would close what she's typing in, so it waits.
const DAY_PAGES = new Set<RouteName>(["dashboard", "statistics"]);

function useDayRollover(name: RouteName): string {
    const [day, setDay] = useState(today);
    const page = useRef(name);
    page.current = name;
    useEffect(() => {
        const check = () => {
            const now = today();
            if (!getState().loaded) return;
            setDay((shown) => {
                if (now === shown) return shown;
                if (DAY_PAGES.has(page.current) && document.querySelector("dialog[open]")) return shown; // retry on the next tick
                return now;
            });
        };
        const timer = setInterval(check, 30_000);
        const onVisible = () => { if (!document.hidden) check(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);
    return day;
}

// Pages about one book, author or series use its name as the browser tab title (as the vanilla app does).
function usePageTitle(name: RouteName, route: HashRoute): string {
    const named = useStore((s) => {
        if (name === "book") return s.books.find((b) => b.id === String(route.id))?.title;
        if (name === "author") return findAuthorName(s.books, route.id);
        if (name === "series" && route.id !== undefined) return findSeriesName(s.books, route.id);
        if (name === "challenges" && route.id !== undefined) return s.challenges.find((c) => c.id === route.id)?.name;
        return undefined;
    });
    return named || ROUTES[name].title;
}

// Strings (not objects), so the title only re-renders when the name changes.
const findAuthorName = (books: Parameters<typeof findAuthor>[0], id: string | undefined) => findAuthor(books, id || "")?.name;
const findSeriesName = (books: Parameters<typeof findSeries>[0], id: string) => findSeries(books, id)?.name;

function View({ name, route, day }: { name: RouteName; route: HashRoute; day: string }) {
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
        case "dashboard": return <DashboardPage key={day} />;
        case "statistics": return <StatisticsPage key={day} />;
        case "library": return <LibraryPage params={route.params} />;
        case "book": return <BookPage key={route.id} id={route.id} />;
        case "physical": return <PhysicalPage />;
        case "authors": return <AuthorsPage />;
        case "author": return <AuthorPage name={route.id || ""} />;
        case "series": return route.id !== undefined ? <SeriesPage name={route.id} /> : <SeriesIndexPage />;
        case "challenges": return route.id !== undefined ? <ChallengeBoardPage id={route.id} /> : <ChallengesIndexPage />;
    }
}
