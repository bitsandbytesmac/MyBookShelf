import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

// Every test gets its own throwaway account (deleted afterwards), already signed in,
// plus small API helpers for seeding data faster than clicking through the UI.

export type BookInput = {
    title: string;
    author?: string;
    status?: "To Be Read" | "Reading" | "Read" | "DNF" | "Paused";
    series?: string;
    seriesNumber?: number;
    seriesTotal?: number;
    genres?: string[];
    totalPages?: number;
    currentPage?: number;
    format?: string;
    dateStarted?: string;
    dateFinished?: string;
};

export type Account = { email: string; password: string; username: string };

export function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function ok(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
    expect(response.ok(), `${response.url()} -> ${response.status()} ${await response.text()}`).toBeTruthy();
    return (await response.json()).data;
}

export class Api {
    private readonly request: APIRequestContext;

    constructor(request: APIRequestContext) {
        this.request = request;
    }

    async createBook(book: BookInput): Promise<{ id: string; title: string }> {
        const row = await ok(await this.request.post("/api/books", {
            data: { author: "Test Author", status: "To Be Read", genres: [], subgenres: [], quotes: [], ...book }
        }));
        return { id: String(row.id), title: row.title };
    }

    async createChallenge(name: string, items: { label: string; bookId?: string | null; done?: boolean }[]) {
        const data = await ok(await this.request.post("/api/challenges", {
            data: { name, description: "", items: items.map((i) => ({ bookId: null, done: false, ...i })) }
        }));
        return data as { id: string };
    }
}

export async function signUpViaApi(request: APIRequestContext, page: Page): Promise<Account> {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    // Usernames are unique too, not just emails.
    const account = { username: `E2E Reader ${stamp}`, email: `e2e${stamp}@example.test`, password: "E2e-test-pass-123" };
    await ok(await request.post("/api/auth/register", { data: account }));
    const user = await ok(await request.post("/api/auth/login", { data: { email: account.email, password: account.password } }));
    // The app only opens when it finds the display copy of the user in localStorage (the session itself is the cookie).
    await page.addInitScript((u) => localStorage.setItem("user", JSON.stringify(u)), { id: user.id, username: user.username, email: user.email });
    return account;
}

export async function deleteAccount(request: APIRequestContext, password: string) {
    const response = await request.delete("/api/auth/account", { data: { password } });
    // 401 just means the test already signed out or deleted the account.
    expect([200, 401]).toContain(response.status());
}

export const test = base.extend<{ account: Account; api: Api }>({
    // page.request shares the browser context's cookies, so seeding and the UI use the same session.
    account: async ({ page }, use) => {
        const account = await signUpViaApi(page.request, page);
        await use(account);
        await deleteAccount(page.request, account.password);
    },
    api: async ({ page, account }, use) => {
        void account; // make sure we're signed in first
        await use(new Api(page.request));
    }
});

export { expect };

// ---------- UI helpers ----------

export async function expectToast(page: Page, text: string | RegExp) {
    await expect(page.locator(".toast").filter({ hasText: text }).first()).toBeVisible();
}

export function dialog(page: Page, name: string | RegExp) {
    return page.getByRole("dialog", { name });
}
