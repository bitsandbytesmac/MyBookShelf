
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Return DATE columns as "YYYY-MM-DD" strings. The default converts them to a
// local-midnight Date, which shifts a day when serialized to UTC JSON.
pg.types.setTypeParser(1082, (value) => value);

let pool;

if (process.env.DATABASE_URL) {
    // Hosted database: Neon
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 1
    });
} else {
    // Local database: PostgreSQL
    pool = new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD,
        port: process.env.DB_PORT
    });
}

export default pool;

// Test the local database connection only.
if (!process.env.DATABASE_URL) {
    pool.connect()
        .then(client => {
            console.log("Connected to local PostgreSQL successfully!");
            client.release();
        })
        .catch(error => {
            console.error("PostgreSQL connection failed:", error.message);
        });
}
