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