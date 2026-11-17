// Thin fetch wrapper around the MyBookShelf REST API (same behaviour as public/js/api.js).

export class ApiError extends Error {
    readonly status: number;
    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}

export type ApiResponse<T> = { status?: string; message?: string; data: T };

let redirecting = false;

// The login token is an HttpOnly cookie the browser sends by itself; scripts never see it.
// localStorage only keeps the user's name/email/theme for display.
try {
    localStorage.removeItem("token"); // left over from before the cookie switch
} catch {
    /* storage blocked */
}

export async function logout(reason?: string) {
    if (redirecting) return;
    redirecting = true;
    // Ask the server to drop the cookie. Don't let a network problem stop the logout.
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    localStorage.removeItem("user");
    if (reason) sessionStorage.setItem("authMessage", reason);
    location.replace("/login.html");
}

type RequestOptions = { method?: string; body?: unknown; auth?: boolean };

export async function request<T = unknown>(path: string, { method = "GET", body, auth = true }: RequestOptions = {}): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {};
    let payload: BodyInit | undefined;

    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
    }

    let response: Response;
    try {
        response = await fetch(path, { method, headers, body: payload });
    } catch (cause) {
        // No response at all: server stopped/crashed, wrong origin, or blocked by an extension.
        console.error(`Network error: ${method} ${path} (page origin ${location.origin})`, cause);
        throw new ApiError("Can't reach the server. Check your connection.", 0);
    }

    let result: Partial<ApiResponse<T>> = {};
    try {
        result = await response.json();
    } catch {
        /* non-JSON body */
    }

    // Any 401 means the session is over (so the server uses 400 for things like a wrong password).
    if (auth && response.status === 401) {
        logout(result.message && !/no token/i.test(result.message)
            ? result.message
            : "Your session expired. Please log in again.");
        throw new ApiError("Session expired.", 401);
    }
    if (!response.ok) {
        throw new ApiError(result.message || `Request failed (${response.status}).`, response.status);
    }
    return result as ApiResponse<T>;
}
