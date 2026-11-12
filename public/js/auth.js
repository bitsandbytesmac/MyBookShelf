// Login and registration pages.
import { api } from "./api.js";

const errorEl = document.getElementById("formError");

// Message left behind by an expired session.
const notice = sessionStorage.getItem("authMessage");
if (notice && errorEl) {
    errorEl.textContent = notice;
    sessionStorage.removeItem("authMessage");
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
