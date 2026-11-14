import { test, expect } from "@playwright/test";

test.describe("Accounts", () => {
    test("sign up, log out, log back in, then delete the account from the menu", async ({ page }) => {
        const email = `e2e-ui${Date.now()}@example.test`;
        const password = "E2e-test-pass-123";

        await page.goto("/register.html");
        await page.locator("#username").fill(`UI Reader ${Date.now()}`);
        await page.locator("#email").fill(email);
        await page.locator("#password").fill(password);
        await page.getByRole("button", { name: "Create account" }).click();

        await expect(page.getByRole("heading", { level: 1 })).toContainText("UI Reader");
        await expect(page.getByText("Your shelf is waiting for its first book.")).toBeVisible();

        await page.getByRole("button", { name: "Account menu" }).click();
        await page.getByRole("menuitem", { name: "Log out" }).click();
        await expect(page).toHaveURL(/login\.html/);
        // The URL changes before the page's script has run; a click before then just reloads the form.
        await page.waitForLoadState("domcontentloaded");

        await page.locator("#email").fill(email.toUpperCase()); // emails are case-insensitive
        await page.locator("#password").fill(password);
        const loginResponse = page.waitForResponse("**/api/auth/login");
        await page.getByRole("button", { name: "Log in" }).click();
        const login = await loginResponse;
        // (Only read the body on failure: on success the page navigates away and the body is gone.)
        expect(login.ok(), login.ok() ? "" : `login: ${login.status()} ${await login.text()}`).toBeTruthy();
        await expect(page.getByRole("heading", { level: 1 })).toContainText("UI Reader");

        // Something in the new tables, so deleting the account has to clean them up too.
        await page.request.post("/api/challenges", { data: { name: "Doomed", items: [{ label: "A" }] } });
        await page.request.post("/api/goals/custom", { data: { metric: "books", period: "year", target: 3 } });

        await page.getByRole("button", { name: "Account menu" }).click();
        await page.getByRole("menuitem", { name: "Delete account" }).click();
        const confirm = page.getByRole("dialog", { name: "Delete your account?" });
        await confirm.getByLabel("Enter your password to confirm").fill("wrong password");
        await confirm.getByRole("button", { name: "Delete forever" }).click();
        await expect(confirm.getByText("That password isn't right.")).toBeVisible(); // 400, not a logout
        await confirm.getByLabel("Enter your password to confirm").fill(password);
        await confirm.getByRole("button", { name: "Delete forever" }).click();
        await expect(page).toHaveURL(/login\.html/);
        await expect(page.getByText("Your account and all your books have been deleted.")).toBeVisible();

        const relogin = await page.request.post("/api/auth/login", { data: { email, password } });
        expect(relogin.ok()).toBeFalsy();
    });

    test("wrong password shows an error and stays on the login page", async ({ page }) => {
        await page.goto("/login.html");
        await page.locator("#email").fill("nobody@example.test");
        await page.locator("#password").fill("not-the-password");
        await page.getByRole("button", { name: "Log in" }).click();
        await expect(page.locator("#formError")).not.toBeEmpty();
        await expect(page).toHaveURL(/login\.html/);
    });

    test("the app redirects to login when signed out", async ({ page }) => {
        await page.goto("/index.html#/challenges");
        await expect(page).toHaveURL(/login\.html/);
    });
});
