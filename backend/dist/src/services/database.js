import { Pool } from 'pg';
class DatabaseService {
    pool;
    constructor() {
        this.pool = new Pool({
            user: 'postgres',
            host: 'localhost',
            database: 'studentportal',
            password: 'you2006',
            port: 5432,
        });
        this.testConnection();
    }
    testConnection() {
        this.pool.connect((err, client, release) => {
            if (err) {
                console.error('❌ Database connection failed:', err.message);
            }
            else {
                console.log('✅ Database connected successfully!');
                console.log('📊 Connected to: studentportal database');
                console.log('🔌 PostgreSQL server: localhost:5432');
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
    async close() {
        await this.pool.end();
    }
}
export default new DatabaseService();
//# sourceMappingURL=database.js.map