
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

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
