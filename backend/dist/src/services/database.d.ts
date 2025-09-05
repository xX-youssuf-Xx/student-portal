import { Pool } from 'pg';
import type { QueryResult, QueryResultRow } from 'pg';
declare class DatabaseService {
    private pool;
    constructor();
    private testConnection;
    getPool(): Pool;
    query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
    getClient(): Promise<{
        query: <T extends QueryResultRow = any>(text: string, params?: any[]) => Promise<QueryResult<T>>;
        release: () => void;
        queryWithTransaction: (queries: {
            text: string;
            params?: any[];
        }[]) => Promise<QueryResult<any>[]>;
    }>;
    close(): Promise<void>;
}
declare const _default: DatabaseService;
export default _default;
//# sourceMappingURL=database.d.ts.map