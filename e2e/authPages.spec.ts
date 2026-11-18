import { test, expect, deleteAccount } from "./fixtures";

// The sign-in pages: login, register, forgot-password and reset-password.
// Runs against the vanilla app and the React build. Nothing here sends real email: the test server
// has no SMTP settings, so a reset request is only logged.

test.describe("Sign-in pages", () => {
    test("login checks the form before calling the server and carries the email to Forgot password", async ({ page }) => {
        await page.goto("/login.html");
        await page.getByRole("button", { name: "Log in" }).click();
        await expect(page.locator("#formError")).toHaveText("Enter a valid email address.");
        await expect(page.locator("#email")).toBeFocused();

        await page.locator("#email").fill("reader@example.test");
        await page.getByRole("button", { name: "Log in" }).click();
        await expect(page.locator("#formError")).toHaveText("Enter your password.");
        await expect(page.locator("#password")).toBeFocused();

        await page.getByRole("link", { name: "Forgot password?" }).click();
        await expect(page).toHaveURL(/forgot-password\.html\?email=reader%40example\.test$/);
        await expect(page.locator("#email")).toHaveValue("reader@example.test");
    });

    test("messages left by the app show once on the login page", async ({ page }) => {
        await page.goto("/login.html");
        await page.evaluate(() => {
            sessionStorage.setItem("authMessage", "Your session expired. Please log in again.");
            sessionStorage.setItem("authNotice", "Password updated. Log in with your new password.");
        });
        await page.reload();
        await expect(page.locator("#formError")).toHaveText("Your session expired. Please log in again.");
        await expect(page.locator("#formNotice")).toHaveText("Password updated. Log in with your new password.");
        await page.reload();
        await expect(page.locator("#formError")).toBeEmpty();
        await expect(page.locator("#formNotice")).toBeEmpty();
    });

    test("a signed-in reader who opens the login page goes to the app", async ({ page, account }) => {
        void account;
        await page.goto("/login.html");
        await expect(page).not.toHaveURL(/login\.html/);
        await expect(page.locator("nav.tabs")).toBeVisible();
    });

    test("register checks the form, signs the new reader in, and refuses a used email", async ({ page }) => {
        const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        const email = `e2e-reg${stamp}@example.test`;
        const password = "E2e-test-pass-123";

        await page.goto("/register.html");
        const submit = page.getByRole("button", { name: "Create account" });
        await submit.click();
        await expect(page.locator("#formError")).toHaveText("Enter your name.");
        await expect(page.locator("#username")).toBeFocused();
        await page.locator("#username").fill(`Reg Reader ${stamp}`);
        await page.locator("#email").fill("not-an-email");
        await submit.click();
        await expect(page.locator("#formError")).toHaveText("Enter a valid email address.");
        await page.locator("#email").fill(email);
        await page.locator("#password").fill("short");
        await submit.click();
        await expect(page.locator("#formError")).toHaveText("Password must be at least 8 characters.");
        await expect(page.locator("#password")).toBeFocused();

        await page.locator("#password").fill(password);
        await submit.click();
        await expect(page.locator("nav.tabs")).toBeVisible();
        expect(await page.evaluate(() => JSON.parse(localStorage.getItem("user") || "{}").email)).toBe(email);

        try {
            // Same email again (signed out in this browser first).
            await page.evaluate(() => localStorage.removeItem("user"));
            await page.goto("/register.html");
            await page.locator("#username").fill(`Other Reader ${stamp}`);
            await page.locator("#email").fill(email.toUpperCase());
            await page.locator("#password").fill(password);
            await submit.click();
            await expect(page.locator("#formError")).toHaveText("Email already exists. Please use another email.");
            await expect(submit).toBeEnabled();
        } finally {
            await deleteAccount(page.request, password);
        }
    });

    test("forgot password always gives the same answer and can be tried again", async ({ page }) => {
        await page.goto("/forgot-password.html");
        await page.getByRole("button", { name: "Send reset link" }).click();
        await expect(page.locator("#formError")).toHaveText("Enter a valid email address.");

        // An address with no account gets the same reply as a real one (no account discovery).
        await page.locator("#email").fill(`nobody${Date.now()}@example.test`);
        await page.getByRole("button", { name: "Send reset link" }).click();
        const sent = page.getByRole("status").filter({ hasText: "Check your email" });
        await expect(sent).toBeVisible();
        await expect(page.locator("#sentMessage")).toHaveText("If an account exists for that email, we've sent a link to reset your password.");
        await expect(page.locator("#forgotForm")).toBeHidden();

        await page.getByRole("button", { name: "try again" }).click();
        await expect(page.locator("#forgotForm")).toBeVisible();
        await expect(page.locator("#email")).toBeFocused();
    });

    test("reset password: missing link, form checks, and a link the server doesn't know", async ({ page }) => {
        await page.goto("/reset-password.html");
        await expect(page.getByRole("alert")).toContainText("This reset link is missing or incomplete.");
        await expect(page.locator("#resetForm")).toBeHidden();

        // A well-formed token: the form shows, and the token leaves the address bar.
        await page.goto(`/reset-password.html?token=${"ab".repeat(32)}`);
        await expect(page.locator("#resetForm")).toBeVisible();
        await expect(page).toHaveURL(/reset-password\.html$/);

        const submit = page.getByRole("button", { name: "Update password" });
        await page.locator("#password").fill("short");
        await submit.click();
        await expect(page.locator("#formError")).toHaveText("Password must be at least 8 characters.");
        await page.locator("#password").fill("A-new-password-1");
        await page.locator("#confirmPassword").fill("A-different-one-2");
        await submit.click();
        await expect(page.locator("#formError")).toHaveText("The passwords don't match.");
        await expect(page.locator("#confirmPassword")).toBeFocused();

        await page.locator("#confirmPassword").fill("A-new-password-1");
        await submit.click();
        await expect(page.locator("#invalidMessage")).toHaveText(/This reset link (is invalid|has expired)/);
        await expect(page.getByRole("link", { name: "Request a new link" })).toHaveAttribute("href", "forgot-password.html");
    });

    test("privacy and terms pages open from the sign-in pages", async ({ page }) => {
        await page.goto("/login.html");
        await page.getByRole("link", { name: "Privacy" }).click();
        await expect(page).toHaveTitle(/Privacy Policy/);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.getByRole("link", { name: "Terms & Conditions" }).click();
        await expect(page).toHaveTitle(/Terms/);
        // Styled by the shared stylesheet (fonts are blocked in tests, so check a layout rule instead).
        // (A retrying check: under load the page can be read a moment before its stylesheet has applied.)
        await expect(page.locator("main.legal")).not.toHaveCSS("max-width", "none");
    });
});
