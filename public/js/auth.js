// Login, registration, forgot-password and reset-password pages.
import { api } from "./api.js";

const errorEl = document.getElementById("formError");

// Message left behind by an expired session.
const notice = sessionStorage.getItem("authMessage");
if (notice && errorEl) {
    errorEl.textContent = notice;
    sessionStorage.removeItem("authMessage");
}

// Success message left behind by a password reset.
const successNotice = sessionStorage.getItem("authNotice");
const noticeEl = document.getElementById("formNotice");
if (successNotice && noticeEl) {
    noticeEl.textContent = successNotice;
    sessionStorage.removeItem("authNotice");
}

function storeSession(data) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify({ id: data.id, username: data.username, email: data.email }));
}

function setBusy(form, busy, label) {
    const button = form.querySelector("button[type='submit']");
    button.disabled = busy;
    if (label) button.textContent = label;
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// ---------- Login ----------

const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorEl.textContent = "";

        const email = loginForm.email.value.trim();
        const password = loginForm.password.value;

        if (!validEmail(email)) {
            errorEl.textContent = "Enter a valid email address.";
            loginForm.email.focus();
            return;
        }
        if (!password) {
            errorEl.textContent = "Enter your password.";
            loginForm.password.focus();
            return;
        }

        setBusy(loginForm, true, "Logging in…");
        try {
            const result = await api.login(email, password);
            storeSession(result.data);
            location.replace("/");
        } catch (error) {
            errorEl.textContent = error.message;
            setBusy(loginForm, false, "Log in");
        }
    });
}

// ---------- Register ----------

const registerForm = document.getElementById("registerForm");

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorEl.textContent = "";

        const username = registerForm.username.value.trim();
        const email = registerForm.email.value.trim();
        const password = registerForm.password.value;

        if (!username) {
            errorEl.textContent = "Enter your name.";
            registerForm.username.focus();
            return;
        }
        if (!validEmail(email)) {
            errorEl.textContent = "Enter a valid email address.";
            registerForm.email.focus();
            return;
        }
        if (password.length < 8) {
            errorEl.textContent = "Password must be at least 8 characters.";
            registerForm.password.focus();
            return;
        }

        setBusy(registerForm, true, "Creating account…");
        try {
            await api.register(username, email, password);
            // Sign straight in so the new user lands on their shelf.
            const result = await api.login(email, password);
            storeSession(result.data);
            location.replace("/");
        } catch (error) {
            errorEl.textContent = error.message;
            setBusy(registerForm, false, "Create account");
        }
    });
}

// Pass the email typed on the login page along to "Forgot password?".
const forgotLink = document.getElementById("forgotLink");
if (forgotLink && loginForm) {
    forgotLink.addEventListener("click", () => {
        const email = loginForm.email.value.trim();
        forgotLink.href = email ? `forgot-password.html?email=${encodeURIComponent(email)}` : "forgot-password.html";
    });
}

// ---------- Forgot password ----------

const forgotForm = document.getElementById("forgotForm");

if (forgotForm) {
    const requestStep = document.getElementById("requestStep");
    const sentStep = document.getElementById("sentStep");

    // Carry over an email typed on the login page.
    const prefill = new URLSearchParams(location.search).get("email");
    if (prefill) forgotForm.email.value = prefill;

    forgotForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorEl.textContent = "";

        const email = forgotForm.email.value.trim();
        if (!validEmail(email)) {
            errorEl.textContent = "Enter a valid email address.";
            forgotForm.email.focus();
            return;
        }

        setBusy(forgotForm, true, "Sending…");
        try {
            const result = await api.forgotPassword(email);
            document.getElementById("sentMessage").textContent = result.message;
            requestStep.classList.add("hidden");
            sentStep.classList.remove("hidden");
        } catch (error) {
            errorEl.textContent = error.message;
        } finally {
            setBusy(forgotForm, false, "Send reset link");
        }
    });

    document.getElementById("tryAgain").addEventListener("click", () => {
        sentStep.classList.add("hidden");
        requestStep.classList.remove("hidden");
        forgotForm.email.focus();
    });
}

// ---------- Reset password ----------

const resetForm = document.getElementById("resetForm");

if (resetForm) {
    const token = new URLSearchParams(location.search).get("token") || "";

    // Keep the token out of browser history and address-bar screenshots.
    if (location.search) history.replaceState(null, "", location.pathname);

    const showInvalid = (message) => {
        if (message) document.getElementById("invalidMessage").textContent = message;
        document.getElementById("resetStep").classList.add("hidden");
        document.getElementById("invalidStep").classList.remove("hidden");
    };

    if (!/^[a-f0-9]{64}$/.test(token)) showInvalid();

    resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        errorEl.textContent = "";

        const password = resetForm.password.value;
        const confirm = resetForm.confirmPassword.value;

        if (password.length < 8) {
            errorEl.textContent = "Password must be at least 8 characters.";
            resetForm.password.focus();
            return;
        }
        if (password !== confirm) {
            errorEl.textContent = "The passwords don't match.";
            resetForm.confirmPassword.focus();
            return;
        }

        setBusy(resetForm, true, "Updating…");
        try {
            await api.resetPassword(token, password);
            // Any old session on this device belongs to the previous password.
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.setItem("authNotice", "Password updated. Log in with your new password.");
            location.replace("/login.html");
        } catch (error) {
            if (error.status === 400 && /expired|invalid|already used/i.test(error.message)) showInvalid(error.message);
            else errorEl.textContent = error.message;
            setBusy(resetForm, false, "Update password");
        }
    });
}
