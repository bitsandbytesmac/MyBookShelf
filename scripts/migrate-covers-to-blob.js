// One-time move of uploaded book covers from the old Cloudinary links to Vercel Blob.
//
//   npm run covers:migrate -- --dry-run      list what would move, change nothing
//   npm run covers:migrate                   copy each cover to Blob and point the book at the new URL
//
// Uses DATABASE_URL if set (Neon), otherwise the local DB_* settings, like `npm run migrate`.
// Needs only BLOB_READ_WRITE_TOKEN: the old covers are public images, so no Cloudinary keys are required.
// Safe to run more than once: books already on Blob are skipped.
// Afterwards, delete the originals in Cloudinary itself (Media Library > mybookshelf/covers) or close the account.
import pool from "../src/config/db.js";
import { saveCover, blobConfigured } from "../src/services/coverStorage.js";

const dryRun = process.argv.includes("--dry-run");

if (!blobConfigured() && !dryRun) {
    console.error("BLOB_READ_WRITE_TOKEN is not set. Add it to .env first.");
    process.exit(1);
}

const target = process.env.DATABASE_URL ? "DATABASE_URL (e.g. Neon)" : `local database "${process.env.DB_NAME}"`;
console.log(`Covers: Cloudinary -> Vercel Blob  |  ${target}${dryRun ? "  |  DRY RUN" : ""}\n`);

const { rows } = await pool.query(
    `SELECT id, user_id, title, cover_url FROM books
     WHERE cover_url LIKE 'https://res.cloudinary.com/%/mybookshelf/covers/%'
     ORDER BY id`
);

if (!rows.length) {
    console.log("Nothing to move: no books use Cloudinary covers.");
    await pool.end();
    process.exit(0);
}

let moved = 0, failed = 0;

for (const book of rows) {
    const label = `"${book.title}" (book ${book.id})`;
    if (dryRun) {
        console.log(`would move  ${label}`);
        continue;
    }
    try {
        const response = await fetch(book.cover_url);
        if (!response.ok) throw new Error(`download failed (HTTP ${response.status})`);
        const buffer = Buffer.from(await response.arrayBuffer());

        const newUrl = await saveCover(book.user_id, buffer);
        // Only switch if the book still has the same cover (it might have been edited meanwhile).
        const updated = await pool.query("UPDATE books SET cover_url = $1 WHERE id = $2 AND cover_url = $3", [newUrl, book.id, book.cover_url]);
        if (!updated.rowCount) throw new Error("the book changed while copying; run again");

        moved++;
        console.log(`moved       ${label}`);
    } catch (error) {
        failed++;
        console.error(`FAILED      ${label}: ${error.message}`);
    }
}

console.log(dryRun
    ? `\n${rows.length} cover(s) would move. Run without --dry-run to copy them.`
    : `\nDone: ${moved} moved, ${failed} failed.${failed ? " Run again to retry the failed ones." : " You can now delete the originals in Cloudinary."}`);
await pool.end();
process.exit(failed ? 1 : 0);
