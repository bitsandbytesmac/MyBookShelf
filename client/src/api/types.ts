// Shapes of the data the app works with. Server rows are mapped to these in mappers.ts.

export type BookStatus = "To Be Read" | "Reading" | "Read" | "Paused" | "DNF";

export type Book = {
    id: string;
    title: string;
    author: string;
    summary: string;
    coverUrl: string | null;
    series: string;
    seriesNumber: number | null;
    seriesTotal: number | null;
    genres: string[];
    subgenres: string[];
    tropes: string[];
    contentWarnings: string[];
    themes: string[];
    settings: string[];
    characters: string[];
    publishedYear: number | null;
    format: string;
    ownership: string;
    ageCategory: string;
    status: BookStatus;
    totalPages: number;
    currentPage: number;
    rating: number | null;
    spice: number | null;
    quotes: string[];
    review: string;
    notes: string;
    dateStarted: string | null;
    dateFinished: string | null;
    isFavorite: boolean;
    reviewed: boolean;
    journaled: boolean;
    isPhysical: boolean;
    createdAt: string | null;
};

// What a new book needs; everything else has a default (see store.createBook).
export type NewBook = Partial<Omit<Book, "id">> & { title: string; author: string };

// A "Log your reading" entry saved with a book update.
export type Session = { date?: string | null; note?: string | null };

// GET /api/activities (latest 30, snake_case straight from the table).
export type Activity = {
    id: string | number;
    book_id: string | number | null;
    book_title: string;
    previous_page: number;
    current_page: number;
    pages_read: number;
    session_date: string;
    note: string | null;
    created_at: string;
};

export type Statistics = {
    pagesToday: number;
    pagesThisWeek: number;
    pagesThisMonth: number;
    mostReadBook: { book_title: string; pages: number | string } | null;
    readingDays: string[];
};

export type RecapMonth = {
    month: string;
    firstDate: string | null;
    days: { date: string; entries: number; pages: number; books: number }[];
    totals: { days: number; entries: number; pages: number };
};

export type RecapEntry = {
    id: string;
    bookId: string | null;
    title: string;
    author: string;
    coverUrl: string;
    totalPages: number | null;
    previousPage: number;
    currentPage: number;
    pagesRead: number;
    sessionDate: string;
    note: string;
    createdAt: string;
};

export type RecapDay = { date: string; entries: RecapEntry[]; pages: number };

export type Goals = { monthlyGoal: number; yearlyGoal: number };

export type CustomGoal = {
    id: string;
    title: string;
    metric: "books" | "pages";
    period: "month" | "year";
    target: number;
    filterType: "genre" | "format" | "age" | null;
    filterValue: string | null;
};

export type TitleRule = { mode: "startsWith" | "contains"; value: string; ignoreArticles?: boolean };

export type Criteria = {
    genres?: string[];
    tropes?: string[];
    themes?: string[];
    settings?: string[];
    characters?: string[];
    ageCategory?: string[];
    format?: string[];
    title?: TitleRule;
    author?: string;
    minPages?: number;
    maxPages?: number;
    yearFrom?: number;
    yearTo?: number;
};

export type ChallengeItem = {
    label: string;
    criteria?: Criteria | null;
    bookId: string | null;
    done?: boolean;
    assignedAt?: string;
};

export type Challenge = {
    id: string;
    name: string;
    description: string;
    startsOn: string | null;
    endsOn: string | null;
    autoMatch: boolean;
    items: ChallengeItem[];
    createdAt?: string;
};

export type ThemePreset = "cream" | "blush" | "sage" | "lavender" | "night";
export type Theme = { preset: ThemePreset; background: string | null };

// The signed-in reader as kept in localStorage.user (display only; the session is an HttpOnly cookie).
export type User = { id?: string | number; username?: string; email?: string; theme?: Theme };

// One result of GET /api/google-books/search (the raw Google Books volume).
export type GoogleVolume = {
    id: string;
    volumeInfo: {
        title?: string;
        subtitle?: string;
        authors?: string[];
        description?: string;
        pageCount?: number;
        publishedDate?: string;
        categories?: string[];
        imageLinks?: Record<string, string>;
        seriesInfo?: unknown;
    };
};
