import { Pool } from 'pg';

class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'studentportal',
      password: 'you2006', // Change this in production
      port: 5432,
    });

    this.testConnection();
  }

  private testConnection(): void {
    this.pool.connect((err, client, release) => {
      if (err) {
        console.error('❌ Database connection failed:', err.message);
      } else {
        console.log('✅ Database connected successfully!');
        console.log('📊 Connected to: studentportal database');
        console.log('🔌 PostgreSQL server: localhost:5432');
        release();
      }
    });
  }

  getPool(): Pool {
    return this.pool;
  }

  async query(text: string, params?: any[]) {
    return this.pool.query(text, params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default new DatabaseService(); 