import BetterSqlite3 from 'better-sqlite3';
export declare const db: BetterSqlite3.Database;
/** Round to 2 decimal places — money safety */
export declare function round2(n: number): number;
