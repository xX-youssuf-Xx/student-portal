import { Pool } from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';

type QueryOptions<T = any> = {
  text: string;
  params?: any[];
  rowMode?: 'array' | undefined;
  types?: any;
  name?: string;
  portal?: string;
  binary?: boolean;
  rowAsArray?: boolean;
  rowsAsArray?: boolean;
  resultType?: 'array' | 'object';
  resultSet?: boolean;
  singleRow?: boolean;
  singleValue?: boolean;
  rowCount?: boolean | number;
  oid?: number;
  columnTypes?: any[];
  format?: 'text' | 'binary';
  parseInputDatesAsUTC?: boolean;
  parseInputDatesAsISO?: boolean;
  parseInputDatesAsString?: boolean;
  parseInputDatesAsLocal?: boolean;
  parseInputDatesAsOffset?: boolean;
  parseInputDatesAsTimestamp?: boolean;
  parseInputDatesAsDate?: boolean;
  parseInputDatesAsTime?: boolean;
  parseInputDatesAsUTCTimestamp?: boolean;
  parseInputDatesAsTimestampTZ?: boolean;
  parseInputDatesAsUTCTimestampTZ?: boolean;
  parseInputDatesAsTimestampWithTimeZone?: boolean;
  parseInputDatesAsTimestampWithoutTimeZone?: boolean;
  parseInputDatesAsTimeWithTimeZone?: boolean;
  parseInputDatesAsTimeWithoutTimeZone?: boolean;
  parseInputDatesAsInterval?: boolean;
  parseInputDatesAsJSON?: boolean;
  parseInputDatesAsJSONB?: boolean;
  parseInputDatesAsUUID?: boolean;
  parseInputDatesAsNumeric?: boolean;
  parseInputDatesAsBigInt?: boolean;
  parseInputDatesAsBoolean?: boolean;
  parseInputDatesAsByteA?: boolean;
  parseInputDatesAsChar?: boolean;
  parseInputDatesAsName?: boolean;
  parseInputDatesAsText?: boolean;
  parseInputDatesAsVarchar?: boolean;
  parseInputDatesAsXml?: boolean;
};

class DatabaseService {
  private pool: Pool;

  constructor() {
    // Support DATABASE_URL (for Docker/production) or individual env vars
    const connectionConfig = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          user: process.env.DB_USER || 'postgres',
          host: process.env.DB_HOST || 'localhost',
          database: process.env.DB_NAME || 'studentportal',
          password: process.env.DB_PASSWORD || 'you2006',
          port: parseInt(process.env.DB_PORT || '5432', 10),
        };

    this.pool = new Pool(connectionConfig);

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

  async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async getClient() {
    const client = await this.pool.connect();
    return {
      query: <T extends QueryResultRow = any>(text: string, params?: any[]) => client.query<T>(text, params),
      release: () => client.release(),
      queryWithTransaction: async (queries: {text: string, params?: any[]}[]) => {
        try {
          await client.query('BEGIN');
          const results = [];
          for (const query of queries) {
            const result = await client.query(query.text, query.params);
            results.push(result);
          }
          await client.query('COMMIT');
          return results;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default new DatabaseService(); 