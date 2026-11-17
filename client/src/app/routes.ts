// The app's pages, same names and hash URLs as the vanilla router (public/js/app.js).
// `tab` is the nav tab highlighted on that page (a book page highlights Library, and so on).
export type RouteName =
    | "dashboard" | "library" | "book" | "authors" | "author" | "series"
    | "challenges" | "statistics" | "physical";

export type TabName = "dashboard" | "library" | "authors" | "series" | "statistics" | "challenges" | "physical";

export const ROUTES: Record<RouteName, { title: string; tab: TabName }> = {
    dashboard: { title: "Dashboard", tab: "dashboard" },
    library: { title: "Library", tab: "library" },
    physical: { title: "Physical Books", tab: "physical" },
    book: { title: "Book", tab: "library" },
    authors: { title: "Authors", tab: "authors" },
    author: { title: "Author", tab: "authors" },
    series: { title: "Series", tab: "series" },
    challenges: { title: "Challenges", tab: "challenges" },
    statistics: { title: "Statistics", tab: "statistics" }
};

export const isRouteName = (name: string): name is RouteName => Object.hasOwn(ROUTES, name);

// Old links that still have to work.
export const REDIRECTS: Record<string, string> = { "": "#/dashboard", "#/home": "#/dashboard", "#/stats": "#/statistics" };
