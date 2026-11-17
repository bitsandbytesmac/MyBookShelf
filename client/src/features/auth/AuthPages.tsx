// Login, registration, forgot-password and reset-password pages (same behaviour as public/js/auth.js).
// Ids and texts match the vanilla pages, so password managers and the tests see the same forms.
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { api, ApiError } from "../../api";
import type { User } from "../../api/types";

export type AuthPageName = "login" | "register" | "forgot" | "reset";

// ---------- Read once per page load (not in render: React may render twice in development) ----------

// Message left behind by an expired session, or a success notice (password reset, account deleted).
const leftError = takeSession("authMessage");
const leftNotice = takeSession("authNotice");

function takeSession(key: string): string {
    try {
        const value = sessionStorage.getItem(key) || "";
        sessionStorage.removeItem(key);
        return value;
    } catch {
        return "";
    }
}

const query = new URLSearchParams(location.search);
const resetToken = query.get("token") || "";
// Keep the reset token out of browser history and address-bar screenshots.
if (document.getElementById("root")?.dataset.page === "reset" && location.search) history.replaceState(null, "", location.pathname);

// ---------- Helpers ----------

const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function storeSession(data: User) {
    // The login token itself was set by the server as an HttpOnly cookie.
    localStorage.setItem("user", JSON.stringify({ id: data.id, username: data.username, email: data.email }));
    // Cache this account's look so the app opens in it without a flash (see theme-boot.js).
    if (data.theme) localStorage.setItem("theme", JSON.stringify(data.theme));
    else localStorage.removeItem("theme");
}

const messageOf = (error: unknown) => (error as Error).message;

// Shared form state: an error line, a busy flag, and "show this message and focus that field".
function useForm() {
    const [error, setError] = useState(leftError);
    const [busy, setBusy] = useState(false);
    const fail = (message: string, field?: RefObject<HTMLInputElement | null>) => {
        setError(message);
        field?.current?.focus();
    };
    return { error, setError, busy, setBusy, fail };
}

// ---------- Layout ----------

function AuthLayout({ children, legal = true }: { children: ReactNode; legal?: boolean }) {
    return (
        <main className="auth">
            <div className="auth-card card">
                <a href="/" className="brand">
                    <span className="brand-mark">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" /></svg>
                    </span>
                    MyBookShelf
                </a>
                {children}
            </div>
            {legal ? <p className="auth-legal"><a href="privacy.html">Privacy</a> · <a href="terms.html">Terms</a></p> : null}
        </main>
    );
}

const FormError = ({ message }: { message: string }) => <p className="form-error" id="formError" aria-live="polite">{message}</p>;

export function AuthPage({ page }: { page: AuthPageName }) {
    if (page === "register") return <RegisterPage />;
    if (page === "forgot") return <ForgotPage />;
    if (page === "reset") return <ResetPage />;
    return <LoginPage />;
}

// ---------- Login ----------

function LoginPage() {
    const form = useForm();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const emailRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        form.setError("");
        const address = email.trim();
        if (!validEmail(address)) return form.fail("Enter a valid email address.", emailRef);
        if (!password) return form.fail("Enter your password.", passwordRef);

        form.setBusy(true);
        try {
            const result = await api.login(address, password);
            storeSession(result.data);
            location.replace("/");
        } catch (error) {
            form.setError(messageOf(error));
            form.setBusy(false);
        }
    }

    // "Forgot password?" carries over the email typed here.
    const forgotHref = email.trim() ? `forgot-password.html?email=${encodeURIComponent(email.trim())}` : "forgot-password.html";

    return (
        <AuthLayout>
            <h1>Welcome back</h1>
            <p className="lead">Log in to pick up where you left off.</p>
            <form id="loginForm" noValidate onSubmit={submit}>
                <div className="field">
                    <label htmlFor="email">Email</label>
                    <input ref={emailRef} className="input" type="email" id="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="field">
                    <div className="label-row">
                        <label htmlFor="password">Password</label>
                        <a href={forgotHref} id="forgotLink">Forgot password?</a>
                    </div>
                    <input ref={passwordRef} className="input" type="password" id="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <p className="form-notice" id="formNotice" aria-live="polite">{leftNotice}</p>
                <FormError message={form.error} />
                <button type="submit" className="btn btn-primary btn-block" disabled={form.busy}>{form.busy ? "Logging in…" : "Log in"}</button>
            </form>
            <p className="auth-alt">New here? <a href="register.html">Create an account</a></p>
        </AuthLayout>
    );
}

// ---------- Register ----------

function RegisterPage() {
    const form = useForm();
    const [fields, setFields] = useState({ username: "", email: "", password: "" });
    const refs = { username: useRef<HTMLInputElement>(null), email: useRef<HTMLInputElement>(null), password: useRef<HTMLInputElement>(null) };
    const set = (key: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [key]: e.target.value }));

    async function submit(event: FormEvent) {
        event.preventDefault();
        form.setError("");
        const username = fields.username.trim();
        const email = fields.email.trim();
        if (!username) return form.fail("Enter your name.", refs.username);
        if (!validEmail(email)) return form.fail("Enter a valid email address.", refs.email);
        if (fields.password.length < 8) return form.fail("Password must be at least 8 characters.", refs.password);

        form.setBusy(true);
        try {
            await api.register(username, email, fields.password);
            // Sign straight in so the new reader lands on their shelf.
            const result = await api.login(email, fields.password);
            storeSession(result.data);
            location.replace("/");
        } catch (error) {
            form.setError(messageOf(error));
            form.setBusy(false);
        }
    }

    return (
        <AuthLayout legal={false}>
            <h1>Create your shelf</h1>
            <p className="lead">Track what you read, what you're reading, and what's next.</p>
            <form id="registerForm" noValidate onSubmit={submit}>
                <div className="field">
                    <label htmlFor="username">Name</label>
                    <input ref={refs.username} className="input" id="username" autoComplete="username" required value={fields.username} onChange={set("username")} />
                </div>
                <div className="field">
                    <label htmlFor="email">Email</label>
                    <input ref={refs.email} className="input" type="email" id="email" autoComplete="email" required value={fields.email} onChange={set("email")} />
                </div>
                <div className="field">
                    <label htmlFor="password">Password</label>
                    <input ref={refs.password} className="input" type="password" id="password" autoComplete="new-password" minLength={8} required value={fields.password} onChange={set("password")} />
                    <span className="hint">At least 8 characters.</span>
                </div>
                <FormError message={form.error} />
                <button type="submit" className="btn btn-primary btn-block" disabled={form.busy}>{form.busy ? "Creating account…" : "Create account"}</button>
                <p className="auth-legal">By creating an account, you agree to our <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.</p>
            </form>
            <p className="auth-alt">Already have an account? <a href="login.html">Log in</a></p>
        </AuthLayout>
    );
}

// ---------- Forgot password ----------

function ForgotPage() {
    const form = useForm();
    // Carry over an email typed on the login page.
    const [email, setEmail] = useState(() => query.get("email") || "");
    const [sentMessage, setSentMessage] = useState<string | null>(null);
    const emailRef = useRef<HTMLInputElement>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        form.setError("");
        const address = email.trim();
        if (!validEmail(address)) return form.fail("Enter a valid email address.", emailRef);

        form.setBusy(true);
        try {
            const result = await api.forgotPassword(address);
            setSentMessage(result.message || "");
        } catch (error) {
            form.setError(messageOf(error));
        } finally {
            form.setBusy(false);
        }
    }

    const tryAgain = () => {
        setSentMessage(null);
        // After the form is back on screen.
        setTimeout(() => emailRef.current?.focus(), 0);
    };

    return (
        <AuthLayout>
            <div id="requestStep" className={sentMessage === null ? "" : "hidden"}>
                <h1>Forgot your password?</h1>
                <p className="lead">Enter the email you signed up with and we'll send you a link to choose a new one.</p>
                <form id="forgotForm" noValidate onSubmit={submit}>
                    <div className="field">
                        <label htmlFor="email">Email</label>
                        <input ref={emailRef} className="input" type="email" id="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <FormError message={form.error} />
                    <button type="submit" className="btn btn-primary btn-block" disabled={form.busy}>{form.busy ? "Sending…" : "Send reset link"}</button>
                </form>
            </div>
            <div id="sentStep" className={sentMessage === null ? "hidden" : ""} role="status">
                <div className="auth-icon" aria-hidden="true">✉️</div>
                <h1>Check your email</h1>
                <p className="lead" id="sentMessage">{sentMessage}</p>
                <p className="auth-hint">The link expires in 1 hour. Don't see it? Check your spam folder, or{" "}
                    <button type="button" className="link-btn" id="tryAgain" onClick={tryAgain}>try again</button>.</p>
            </div>
            <p className="auth-alt"><a href="login.html">Back to log in</a></p>
        </AuthLayout>
    );
}

// ---------- Reset password ----------

const MISSING_LINK = "This reset link is missing or incomplete.";

function ResetPage() {
    const form = useForm();
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    // null = the link looks fine; otherwise why it can't be used.
    const [invalid, setInvalid] = useState<string | null>(() => (/^[a-f0-9]{64}$/.test(resetToken) ? null : MISSING_LINK));
    const passwordRef = useRef<HTMLInputElement>(null);
    const confirmRef = useRef<HTMLInputElement>(null);

    async function submit(event: FormEvent) {
        event.preventDefault();
        form.setError("");
        if (password.length < 8) return form.fail("Password must be at least 8 characters.", passwordRef);
        if (password !== confirm) return form.fail("The passwords don't match.", confirmRef);

        form.setBusy(true);
        try {
            await api.resetPassword(resetToken, password);
            // Any old session on this device belongs to the previous password.
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.setItem("authNotice", "Password updated. Log in with your new password.");
            location.replace("/login.html");
        } catch (error) {
            const err = error as ApiError;
            if (err.status === 400 && /expired|invalid|already used/i.test(err.message)) setInvalid(err.message);
            else form.setError(err.message);
            form.setBusy(false);
        }
    }

    return (
        <AuthLayout>
            <div id="resetStep" className={invalid === null ? "" : "hidden"}>
                <h1>Choose a new password</h1>
                <p className="lead">Make it at least 8 characters.</p>
                <form id="resetForm" noValidate onSubmit={submit}>
                    <div className="field">
                        <label htmlFor="password">New password</label>
                        <input ref={passwordRef} className="input" type="password" id="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div className="field">
                        <label htmlFor="confirmPassword">Confirm new password</label>
                        <input ref={confirmRef} className="input" type="password" id="confirmPassword" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </div>
                    <FormError message={form.error} />
                    <button type="submit" className="btn btn-primary btn-block" disabled={form.busy}>{form.busy ? "Updating…" : "Update password"}</button>
                </form>
            </div>
            <div id="invalidStep" className={invalid === null ? "hidden" : ""} role="alert">
                <h1>Link not valid</h1>
                <p className="lead" id="invalidMessage">{invalid || MISSING_LINK}</p>
                <a className="btn btn-primary btn-block" href="forgot-password.html">Request a new link</a>
            </div>
            <p className="auth-alt"><a href="login.html">Back to log in</a></p>
        </AuthLayout>
    );
}
