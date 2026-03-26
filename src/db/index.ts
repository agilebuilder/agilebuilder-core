/**
 * 数据库连接管理
 */

import initSqlJs, { type Database, type SqlJsStatic, type Statement, type SqlValue } from 'sql.js';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { getDbPath } from '../shared/paths.js';
import { SCHEMA_STATEMENTS } from './schema.js';

type QueryParams = ReadonlyArray<SqlValue>;

export type DatabaseRunResult = {
  changes: number;
  lastInsertRowid: number;
};

let sqlite: SqlJsStatic | null = null;
let db: Database | null = null;
let initPromise: Promise<Database> | null = null;
let transactionDepth = 0;
let isDirty = false;
let loadedFileMtimeMs: number | null = null;

const dbPath = getDbPath();
const dbDir = dirname(dbPath);

function getCurrentDbFileMtimeMs(): number | null {
  if (!existsSync(dbPath)) {
    return null;
  }

  return statSync(dbPath).mtimeMs;
}

function ensureWriteGuard(database: Database): void {
  const currentMtimeMs = getCurrentDbFileMtimeMs();
  if (loadedFileMtimeMs !== currentMtimeMs) {
    db = database;
    throw new Error('Database file was modified by another process. Please retry after restarting the current command.');
  }
}

function ensureDbDir(): void {
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
}

async function loadSqlJsRuntime(): Promise<SqlJsStatic> {
  if (sqlite) {
    return sqlite;
  }

  sqlite = await initSqlJs({});
  return sqlite;
}

function bindParams(statement: Statement, params: QueryParams = []): void {
  if (params.length > 0) {
    statement.bind([...params]);
  }
}

function persistDatabase(database: Database): void {
  ensureWriteGuard(database);
  ensureDbDir();
  const data = database.export();
  writeFileSync(dbPath, Buffer.from(data));
  loadedFileMtimeMs = getCurrentDbFileMtimeMs();
  isDirty = false;
}

function markDirty(): void {
  isDirty = true;
}

function shouldPersistImmediately(): boolean {
  return transactionDepth === 0;
}

function getChanges(database: Database): number {
  const result = database.exec('SELECT changes() AS changes');
  const value = result[0]?.values?.[0]?.[0];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function getLastInsertRowid(database: Database): number {
  const result = database.exec('SELECT last_insert_rowid() AS id');
  const value = result[0]?.values?.[0]?.[0];
  return typeof value === 'number' ? value : Number(value ?? 0);
}

export async function getDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const SQL = await loadSqlJsRuntime();
    ensureDbDir();
    const initialData = existsSync(dbPath) ? readFileSync(dbPath) : undefined;
    db = initialData ? new SQL.Database(initialData) : new SQL.Database();
    loadedFileMtimeMs = getCurrentDbFileMtimeMs();
    db.run('PRAGMA foreign_keys = ON');
    return db;
  })();

  try {
    return await initPromise;
  } finally {
    initPromise = null;
  }
}

export async function initDatabase(): Promise<void> {
  const database = await getDatabase();

  for (const statement of SCHEMA_STATEMENTS) {
    database.run(statement);
  }

  persistDatabase(database);
}

export async function closeDatabase(): Promise<void> {
  if (!db) {
    return;
  }

  if (isDirty) {
    persistDatabase(db);
  }
  db.close();
  db = null;
  transactionDepth = 0;
  isDirty = false;
  loadedFileMtimeMs = null;
}

export async function queryAll<T>(sql: string, params: QueryParams = []): Promise<T[]> {
  const database = await getDatabase();
  const statement = database.prepare(sql);

  try {
    bindParams(statement, params);
    const rows: T[] = [];
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
    return rows;
  } finally {
    statement.free();
  }
}

export async function queryOne<T>(sql: string, params: QueryParams = []): Promise<T | null> {
  const rows = await queryAll<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: QueryParams = []): Promise<DatabaseRunResult> {
  const database = await getDatabase();
  const statement = database.prepare(sql);

  try {
    bindParams(statement, params);
    statement.step();
  } finally {
    statement.free();
  }

  const result: DatabaseRunResult = {
    changes: getChanges(database),
    lastInsertRowid: getLastInsertRowid(database),
  };

  markDirty();
  if (shouldPersistImmediately()) {
    persistDatabase(database);
  }
  return result;
}

export async function transaction<T>(handler: () => Promise<T>): Promise<T> {
  const database = await getDatabase();
  const isOuterTransaction = transactionDepth === 0;
  if (isOuterTransaction) {
    database.run('BEGIN');
  }
  transactionDepth += 1;

  try {
    const result = await handler();
    transactionDepth -= 1;

    if (isOuterTransaction) {
      database.run('COMMIT');
      if (isDirty) {
        persistDatabase(database);
      }
    }

    return result;
  } catch (error) {
    transactionDepth = Math.max(transactionDepth - 1, 0);
    if (isOuterTransaction) {
      database.run('ROLLBACK');
      isDirty = false;
    }
    throw error;
  }
}
