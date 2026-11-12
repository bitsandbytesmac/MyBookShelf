// Applies SQL files in /migrations that haven't run yet, in filename order.
// Usage: npm run migrate   (uses DATABASE_URL if set, otherwise the local DB_* settings)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pool from "../src/config/db.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const client = await pool.connect();

try {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);

    const applied = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const pending = files.filter((f) => !applied.has(f));

    if (!pending.length) console.log("Database is up to date.");

    for (const file of pending) {
        const sql = fs.readFileSync(path.join(dir, file), "utf8");
        console.log(`Applying ${file}…`);
        await client.query("BEGIN");
        try {
            await client.query(sql);
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
            await client.query("COMMIT");
            console.log(`  done`);
        } catch (error) {
            await client.query("ROLLBACK");
            throw new Error(`${file} failed: ${error.message}`);
        }
    }
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
} finally {
    client.release();
    await pool.end();
}
