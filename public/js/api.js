// Thin wrapper around the MyBookShelf REST API.

export class ApiError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

let redirecting = false;

// The login token is an HttpOnly cookie the browser sends by itself; scripts never see it.
// localStorage only keeps the user's name/email/theme for display.
localStorage.removeItem("token"); // left over from before the cookie switch

export async function logout(reason) {
    if (redirecting) return;
    redirecting = true;
    // Ask the server to drop the cookie. Don't let a network problem stop the logout.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("user");
    if (reason) sessionStorage.setItem("authMessage", reason);
    location.replace("/login.html");
}

async function request(path, { method = "GET", body, auth = true } = {}) {
    const headers = {};
    let payload = body;

    if (body && !(body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
    }

    let response;
    try {
        response = await fetch(path, { method, headers, body: payload });
    } catch (cause) {
        // No response at all: server stopped/crashed, wrong origin, or blocked by an extension.
        console.error(`Network error: ${method} ${path} (page origin ${location.origin})`, cause);
        throw new ApiError("Can't reach the server. Check your connection.", 0);
    }

    let result = {};
    try {
        result = await response.json();
    } catch {
        /* non-JSON body */
    }

    if (auth && response.status === 401) {
        logout(result.message && !/no token/i.test(result.message)
            ? result.message
            : "Your session expired. Please log in again.");
        throw new ApiError("Session expired.", 401);
    }
    if (!response.ok) {
        throw new ApiError(result.message || `Request failed (${response.status}).`, response.status);
    }
    return result;
}

const dateOnly = (value) => (value ? String(value).slice(0, 10) : null);

// Convert a database row to the shape the UI uses.
export function normalizeBook(row) {
    const genres = Array.isArray(row.genres) && row.genres.length ? row.genres : row.genre ? [row.genre] : [];
    return {
        id: String(row.id),
        title: row.title,
        author: row.author,
        summary: row.summary || "",
        coverUrl: row.cover_url || null,
        series: row.series || "",
        seriesNumber: row.series_number != null ? Number(row.series_number) : null, // NUMERIC arrives as a string
        seriesTotal: row.series_total != null ? Number(row.series_total) : null,
        genres,
        subgenres: Array.isArray(row.subgenres) ? row.subgenres : [],
        tropes: Array.isArray(row.tropes) ? row.tropes : [],
        contentWarnings: Array.isArray(row.content_warnings) ? row.content_warnings : [],
        format: row.format || "",
        ownership: row.ownership || "",
        ageCategory: row.age_category || "",
        status: row.status,
        totalPages: Number(row.total_pages) || 0,
        currentPage: Number(row.current_page) || 0,
        rating: row.rating ? Number(row.rating) : null,
        spice: row.spice ? Number(row.spice) : null,
        quotes: Array.isArray(row.quotes) ? row.quotes : [],
        review: row.review || "",
        notes: row.personal_notes || "",
        dateStarted: dateOnly(row.date_started),
        dateFinished: dateOnly(row.date_finished),
        isFavorite: Boolean(row.is_favorite),
        reviewed: Boolean(row.reviewed),
        journaled: Boolean(row.journaled),
        createdAt: row.created_at || null
    };
}

// The API replaces the whole book on update, so always send every field.
function toPayload(book) {
    return {
        title: book.title,
        author: book.author,
        summary: book.summary || null,
        coverUrl: book.coverUrl || null,
        series: book.series || null,
        seriesNumber: book.series ? book.seriesNumber ?? null : null,
        seriesTotal: book.series ? book.seriesTotal ?? null : null,
        genres: book.genres || [],
        subgenres: book.subgenres || [],
        tropes: book.tropes || [],
        contentWarnings: book.contentWarnings || [],
        format: book.format || null,
        ownership: book.ownership || null,
        ageCategory: book.ageCategory || null,
        status: book.status,
        totalPages: book.totalPages || 0,
        currentPage: book.currentPage || 0,
        rating: book.rating || null,
        spice: book.spice || null,
        quotes: book.quotes || [],
        review: book.review || null,
        notes: book.notes || null,
        dateStarted: book.dateStarted || null,
        dateFinished: book.dateFinished || null,
        isFavorite: Boolean(book.isFavorite),
        reviewed: Boolean(book.reviewed),
        journaled: Boolean(book.journaled)
    };
}

export const api = {
    login: (email, password) =>
        request("/api/auth/login", { method: "POST", body: { email, password }, auth: false }),

    register: (username, email, password) =>
        request("/api/auth/register", { method: "POST", body: { username, email, password }, auth: false }),

    forgotPassword: (email) =>
        request("/api/auth/forgot-password", { method: "POST", body: { email }, auth: false }),

    resetPassword: (token, password) =>
        request("/api/auth/reset-password", { method: "POST", body: { token, password }, auth: false }),

    deleteAccount: (password) =>
        request("/api/auth/account", { method: "DELETE", body: { password } }),

    async getBooks() {
        return (await request("/api/books")).data.map(normalizeBook);
    },
    async createBook(book) {
        return normalizeBook((await request("/api/books", { method: "POST", body: toPayload(book) })).data);
    },
    // session (optional): { date: "YYYY-MM-DD", note } - a "Log your reading" journal entry saved with the update.
    async updateBook(id, book, session = null) {
        const body = { ...toPayload(book), ...(session ? { sessionDate: session.date || null, sessionNote: session.note || null } : {}) };
        return normalizeBook((await request(`/api/books/${encodeURIComponent(id)}`, { method: "PUT", body })).data);
    },
    deleteBook: (id) => request(`/api/books/${encodeURIComponent(id)}`, { method: "DELETE" }),

    async getActivities() {
        return (await request("/api/activities")).data;
    },
    async getStatistics() {
        return (await request("/api/activities/statistics")).data;
    },

    async getGoals() {
        return (await request("/api/goals")).data;
    },
    async updateGoals(goals) {
        return (await request("/api/goals", { method: "PUT", body: goals })).data;
    },

    async getCustomGoals() {
        return (await request("/api/goals/custom")).data;
    },
    async createCustomGoal(goal) {
        return (await request("/api/goals/custom", { method: "POST", body: goal })).data;
    },
    async updateCustomGoal(id, goal) {
        return (await request(`/api/goals/custom/${encodeURIComponent(id)}`, { method: "PUT", body: goal })).data;
    },
    deleteCustomGoal: (id) => request(`/api/goals/custom/${encodeURIComponent(id)}`, { method: "DELETE" }),

    async getNextUp() {
        return (await request("/api/next-up")).data.bookIds;
    },
    async updateNextUp(bookIds) {
        return (await request("/api/next-up", { method: "PUT", body: { bookIds } })).data.bookIds;
    },

    async getChallenges() {
        return (await request("/api/challenges")).data;
    },
    async createChallenge(challenge) {
        return (await request("/api/challenges", { method: "POST", body: challenge })).data;
    },
    async updateChallenge(id, challenge) {
        const { name, description, items } = challenge;
        return (await request(`/api/challenges/${encodeURIComponent(id)}`, { method: "PUT", body: { name, description, items } })).data;
    },
    deleteChallenge: (id) => request(`/api/challenges/${encodeURIComponent(id)}`, { method: "DELETE" }),

    async getTheme() {
        return (await request("/api/theme")).data;
    },
    async updateTheme(theme) {
        return (await request("/api/theme", { method: "PUT", body: { preset: theme.preset, background: theme.background } })).data;
    },

    async searchGoogleBooks(query) {
        return (await request(`/api/google-books/search?q=${encodeURIComponent(query)}`)).data;
    },
    async uploadCover(file) {
        const form = new FormData();
        form.append("cover", file);
        return (await request("/api/uploads/cover", { method: "POST", body: form })).data.coverUrl;
    }
};
