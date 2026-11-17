import { test, expect, expectToast, dialog } from "./fixtures";
import type { Page } from "@playwright/test";

// Open the app and wait for its start-up theme sync (GET /api/theme), which re-applies the saved
// look; a preview picked before it lands would be reset by it.
// Checks after UI steps use the page's own fetch: Playwright's request client can reuse a connection
// the local server has already closed while idle (Node's 5 s keep-alive) and fail with ECONNRESET.
async function openApp(page: Page) {
    const synced = page.waitForResponse((r) => r.url().endsWith("/api/theme") && r.request().method() === "GET");
    await page.goto("/index.html#/dashboard");
    await synced;
}

// The account menu and the Customize dialog. Runs against the vanilla app and the React build.

test.describe("Account menu and theme", () => {
    test("the menu shows who is signed in and closes on Escape or a click outside", async ({ page, account }) => {
        await openApp(page);
        const avatar = page.getByRole("button", { name: "Account menu" });
        await expect(avatar).toHaveText(account.username.charAt(0).toUpperCase());

        await avatar.click();
        await expect(avatar).toHaveAttribute("aria-expanded", "true");
        const menu = page.getByRole("menu");
        await expect(menu).toContainText(account.username);
        await expect(menu).toContainText(account.email);
        for (const item of ["Customize look", "Privacy policy", "Terms & conditions", "Log out", "Delete account"]) {
            await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
        }

        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await avatar.click();
        await expect(menu).toBeVisible();
        await page.locator("main#view").click({ position: { x: 5, y: 5 } });
        await expect(menu).toBeHidden();
    });

    test("Customize previews a look, Cancel puts the old one back, Save keeps it after a reload", async ({ page, account }) => {
        void account;
        await openApp(page);
        const html = page.locator("html");
        await expect(html).not.toHaveAttribute("data-theme", /.+/);

        const openCustomize = async () => {
            await page.getByRole("button", { name: "Account menu" }).click();
            await page.getByRole("menuitem", { name: "Customize look" }).click();
            return dialog(page, "Customize your shelf");
        };

        // Preview, then cancel.
        let look = await openCustomize();
        await expect(look.getByRole("radio", { name: "Cream", exact: true })).toHaveAttribute("aria-checked", "true");
        await look.getByRole("radio", { name: "Sage", exact: true }).click();
        await expect(html).toHaveAttribute("data-theme", "sage");
        await expect(look.getByRole("radio", { name: "Sage", exact: true })).toHaveAttribute("aria-checked", "true");
        await look.getByRole("button", { name: "Cancel" }).click();
        await expect(look).toBeHidden();
        await expect(html).not.toHaveAttribute("data-theme", /.+/);

        // A background swatch shows its value; Escape also cancels.
        look = await openCustomize();
        await look.getByRole("radio", { name: "Mist background" }).click();
        await expect(look.locator(".bg-value")).toHaveText("#E3EEF2");
        await page.keyboard.press("Escape");
        await expect(look).toBeHidden();
        expect(await html.evaluate((el) => el.style.getPropertyValue("--bg"))).toBe("");

        // Save.
        look = await openCustomize();
        await look.getByRole("radio", { name: "Night", exact: true }).click();
        await look.getByRole("radio", { name: "Mist background" }).click();
        await look.getByRole("button", { name: "Save look" }).click();
        await expectToast(page, "Your new look is saved");
        await expect(look).toBeHidden();
        await expect(html).toHaveAttribute("data-theme", "night");

        // Saved to the account (not just this browser) and applied again on the next visit.
        const saved = await page.evaluate(async () => (await fetch("/api/theme")).json());
        expect(saved.data).toEqual({ preset: "night", background: "#e3eef2" });
        await page.reload();
        await expect(html).toHaveAttribute("data-theme", "night");
        expect(await html.evaluate((el) => el.style.getPropertyValue("--bg"))).toBe("#e3eef2");

        // Reset to default, saved.
        look = await openCustomize();
        await look.getByRole("button", { name: "Reset to default" }).click();
        await look.getByRole("button", { name: "Save look" }).click();
        await expectToast(page, "Your new look is saved");
        await expect(html).not.toHaveAttribute("data-theme", /.+/);
    });

    test("delete account asks for the password and a wrong one keeps you signed in", async ({ page, account }) => {
        void account;
        await openApp(page);
        await page.getByRole("button", { name: "Account menu" }).click();
        await page.getByRole("menuitem", { name: "Delete account" }).click();
        const confirm = dialog(page, "Delete your account?");
        await confirm.getByRole("button", { name: "Delete forever" }).click();
        await expect(confirm.locator(".form-error")).toHaveText("Enter your password to confirm.");
        await expect(confirm.getByLabel("Enter your password to confirm")).toBeFocused();

        await confirm.getByLabel("Enter your password to confirm").fill("not-my-password");
        await confirm.getByRole("button", { name: "Delete forever" }).click();
        await expect(confirm.locator(".form-error")).not.toBeEmpty();
        await expect(page).toHaveURL(/index\.html/);
        await confirm.getByRole("button", { name: "Cancel" }).click();
        await expect(confirm).toBeHidden();
        expect(await page.evaluate(async () => (await fetch("/api/books")).ok)).toBe(true);
    });
});
