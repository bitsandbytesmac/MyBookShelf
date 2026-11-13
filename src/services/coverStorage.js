// Book cover storage on Vercel Blob.
import crypto from "node:crypto";
import { put, del, list } from "@vercel/blob";

export const MAX_COVER_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request limit

const TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp"
};

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

const userPrefix = (userId) => `covers/${String(userId).replace(/[^0-9a-zA-Z_-]/g, "")}/`;

// Identify the image from its first bytes; the browser-supplied type can't be trusted.
export function sniffImageType(buffer) {
    if (!buffer || buffer.length < 12) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return null;
}

// Upload a cover for this user. Returns its public URL.
export async function saveCover(userId, buffer) {
    const type = sniffImageType(buffer);
    if (!type) {
        const error = new Error("That file isn't a JPG, PNG or WEBP image.");
        error.status = 400;
        throw error;
    }
    const pathname = `${userPrefix(userId)}${crypto.randomUUID()}.${TYPES[type]}`;
    const blob = await put(pathname, buffer, {
        access: "public",
        contentType: type,
        addRandomSuffix: false,
        cacheControlMaxAge: 60 * 60 * 24 * 365 // file names are unique, so browsers can cache them for a year
    });
    return blob.url;
}

// The store's public host is "<store id>.public.blob.vercel-storage.com"; the id is part of the token.
function storeHost() {
    const id = (process.env.BLOB_READ_WRITE_TOKEN || "").split("_")[3];
    return id ? `${id.toLowerCase()}.public.blob.vercel-storage.com` : null;
}

// True only for files in OUR store, inside THIS user's folder, so nobody can delete someone else's image.
export function isOwnedCover(url, userId) {
    try {
        const { hostname, pathname } = new URL(url);
        return hostname === storeHost() && decodeURIComponent(pathname).startsWith(`/${userPrefix(userId)}`);
    } catch {
        return false;
    }
}

// ---------- Clean-up ----------

// Delete covers that a book no longer uses (replaced, or the book was deleted). Never throws.
// Anything that isn't this user's own Blob file (Google covers, old links) is left alone.
export async function deleteUnusedCovers(urls, userId) {
    const blobs = urls.filter((u) => u && isOwnedCover(u, userId));
    if (!blobs.length || !blobConfigured()) return;
    try {
        await del(blobs);
    } catch (error) {
        console.error("Couldn't delete old cover image(s):", error.message);
    }
}

// Delete every cover in this user's folder (account deletion), including uploads that were never saved to a book.
export async function deleteAllCoversForUser(userId) {
    if (!blobConfigured()) return;
    let cursor;
    do {
        const page = await list({ prefix: userPrefix(userId), cursor, limit: 1000 });
        if (page.blobs.length) await del(page.blobs.map((b) => b.url));
        cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
}
