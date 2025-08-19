import { Pool } from 'pg';
declare class DatabaseService {
    private pool;
    constructor();
    private testConnection;
    getPool(): Pool;
    query(text: string, params?: any[]): Promise<import("pg").QueryResult<any>>;
    close(): Promise<void>;
}
declare const _default: DatabaseService;
export default _default;
//# sourceMappingURL=database.d.ts.map