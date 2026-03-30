import { Pool } from "pg";
class DatabaseService {
    pool;
    constructor() {
        const connectionConfig = process.env.DATABASE_URL
            ? { connectionString: process.env.DATABASE_URL }
            : {
                user: process.env.DB_USER || "postgres",
                host: process.env.DB_HOST || "localhost",
                database: process.env.DB_NAME || "studentportal",
                password: process.env.DB_PASSWORD || "you2006",
                port: parseInt(process.env.DB_PORT || "5432", 10),
            };
        this.pool = new Pool(connectionConfig);
        this.testConnection();
    }
    testConnection() {
        this.pool.connect((err, client, release) => {
            if (err) {
                console.error("❌ Database connection failed:", err.message);
            }
            else {
                console.log("✅ Database connected successfully!");
                console.log("📊 Connected to: studentportal database");
                console.log("🔌 PostgreSQL server: localhost:5432");
                release();
            }
        });
    }
    getPool() {
        return this.pool;
    }
    async query(text, params) {
        return this.pool.query(text, params);
    }
    async getClient() {
        const client = await this.pool.connect();
        return {
            query: (text, params) => client.query(text, params),
            release: () => client.release(),
            queryWithTransaction: async (queries) => {
                try {
                    await client.query("BEGIN");
                    const results = [];
                    for (const query of queries) {
                        const result = await client.query(query.text, query.params);
                        results.push(result);
                    }
                    await client.query("COMMIT");
                    return results;
                }
                catch (error) {
                    await client.query("ROLLBACK");
                    throw error;
                }
                finally {
                    client.release();
                }
            },
        };
    }
    async close() {
        await this.pool.end();
    }
}
export default new DatabaseService();
//# sourceMappingURL=database.js.map