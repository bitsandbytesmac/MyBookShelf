import { test, expect } from "./fixtures";

// Guard: the test server must never talk to the real Vercel Blob store (see playwright.config.ts).
// With no token, the upload endpoint stops before any Blob call, so this check itself costs nothing.
test("tests run with Vercel Blob switched off", async ({ page, account }) => {
    void account;
    // A real 1x1 PNG, so the request gets past file checks to the "is Blob set up?" check.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const response = await page.request.post("/api/uploads/cover", {
        multipart: { cover: { name: "tiny.png", mimeType: "image/png", buffer: png } }
    });
    expect(response.status(), "The test server has a BLOB_READ_WRITE_TOKEN; tests would use up real Blob operations.").toBe(500);
    expect((await response.json()).message).toBe("Cover uploads aren't set up yet.");
});
