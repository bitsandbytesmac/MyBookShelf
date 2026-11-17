// Every endpoint the app calls. Same requests as public/js/api.js; responses are typed.
import { request } from "./client";
import { normalizeBook, toPayload, type BookRow } from "./mappers";
import { today as localDate } from "../domain/dates";
import type {
    Activity, Book, Challenge, CustomGoal, Goals, GoogleVolume, RecapDay, RecapMonth, Session, Statistics, Theme, User
} from "./types";

export { ApiError, logout } from "./client";

const id = (value: string | number) => encodeURIComponent(String(value));

export const api = {
    login: (email: string, password: string) =>
        request<User>("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),
    register: (username: string, email: string, password: string) =>
        request<User>("/api/auth/register", { method: "POST", body: { username, email, password }, auth: false }),
    forgotPassword: (email: string) =>
        request("/api/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
    resetPassword: (token: string, password: string) =>
        request("/api/auth/reset-password", { method: "POST", body: { token, password }, auth: false }),
    deleteAccount: (password: string) =>
        request("/api/auth/account", { method: "DELETE", body: { password } }),

    async getBooks(): Promise<Book[]> {
        return (await request<BookRow[]>("/api/books")).data.map(normalizeBook);
    },
    async createBook(book: Partial<Book>): Promise<Book> {
        return normalizeBook((await request<BookRow>("/api/books", { method: "POST", body: toPayload(book) })).data);
    },
    // session: a "Log your reading" journal entry saved with the update.
    // localDate: the reader's own calendar date, so an entry saved at 7 am in UTC+8 lands on today, not
    // on the server's (UTC) yesterday. The server only accepts it within a day of its own date.
    async updateBook(bookId: string, book: Partial<Book>, session: Session | null = null): Promise<Book> {
        const body = {
            ...toPayload(book),
            localDate: localDate(),
            ...(session ? { sessionDate: session.date || null, sessionNote: session.note || null } : {})
        };
        return normalizeBook((await request<BookRow>(`/api/books/${id(bookId)}`, { method: "PUT", body })).data);
    },
    deleteBook: (bookId: string) => request(`/api/books/${id(bookId)}`, { method: "DELETE" }),

    async getActivities(): Promise<Activity[]> {
        return (await request<Activity[]>("/api/activities")).data;
    },
    async getStatistics(): Promise<Statistics> {
        return (await request<Statistics>(`/api/activities/statistics?today=${localDate()}`)).data;
    },
    async getRecapMonth(month: string): Promise<RecapMonth> {
        return (await request<RecapMonth>(`/api/activities/recap?month=${encodeURIComponent(month)}`)).data;
    },
    async getRecapDay(date: string): Promise<RecapDay> {
        return (await request<RecapDay>(`/api/activities/recap/${encodeURIComponent(date)}`)).data;
    },

    async getGoals(): Promise<Goals> {
        return (await request<Goals>("/api/goals")).data;
    },
    async updateGoals(goals: Goals): Promise<Goals> {
        return (await request<Goals>("/api/goals", { method: "PUT", body: goals })).data;
    },
    async getCustomGoals(): Promise<CustomGoal[]> {
        return (await request<CustomGoal[]>("/api/goals/custom")).data;
    },
    async createCustomGoal(goal: Omit<CustomGoal, "id">): Promise<CustomGoal> {
        return (await request<CustomGoal>("/api/goals/custom", { method: "POST", body: goal })).data;
    },
    async updateCustomGoal(goalId: string, goal: Omit<CustomGoal, "id">): Promise<CustomGoal> {
        return (await request<CustomGoal>(`/api/goals/custom/${id(goalId)}`, { method: "PUT", body: goal })).data;
    },
    deleteCustomGoal: (goalId: string) => request(`/api/goals/custom/${id(goalId)}`, { method: "DELETE" }),

    async getNextUp(): Promise<string[]> {
        return (await request<{ bookIds: string[] }>("/api/next-up")).data.bookIds.map(String);
    },
    async updateNextUp(bookIds: string[]): Promise<string[]> {
        return (await request<{ bookIds: string[] }>("/api/next-up", { method: "PUT", body: { bookIds } })).data.bookIds.map(String);
    },

    async getChallenges(): Promise<Challenge[]> {
        return (await request<Challenge[]>("/api/challenges")).data;
    },
    async createChallenge(challenge: Omit<Challenge, "id">): Promise<Challenge> {
        return (await request<Challenge>("/api/challenges", { method: "POST", body: challenge })).data;
    },
    async updateChallenge(challengeId: string, challenge: Challenge): Promise<Challenge> {
        // Full replacement: send every field the server keeps.
        const { name, description, startsOn, endsOn, autoMatch, items } = challenge;
        return (await request<Challenge>(`/api/challenges/${id(challengeId)}`, { method: "PUT", body: { name, description, startsOn, endsOn, autoMatch, items } })).data;
    },
    deleteChallenge: (challengeId: string) => request(`/api/challenges/${id(challengeId)}`, { method: "DELETE" }),

    async getTheme(): Promise<Theme> {
        return (await request<Theme>("/api/theme")).data;
    },
    async updateTheme(theme: Theme): Promise<Theme> {
        return (await request<Theme>("/api/theme", { method: "PUT", body: { preset: theme.preset, background: theme.background } })).data;
    },

    // Spends the Google Books API quota; only ever called when the reader searches.
    async searchGoogleBooks(query: string): Promise<GoogleVolume[]> {
        return (await request<GoogleVolume[]>(`/api/google-books/search?q=${encodeURIComponent(query)}`)).data;
    },
    async uploadCover(file: File): Promise<string> {
        const form = new FormData();
        form.append("cover", file);
        return (await request<{ coverUrl: string }>("/api/uploads/cover", { method: "POST", body: form })).data.coverUrl;
    }
};
