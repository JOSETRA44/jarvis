import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import * as schema from './schema.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS operators (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  identifier TEXT NOT NULL,
  display_name TEXT NOT NULL,
  permissions TEXT NOT NULL DEFAULT '["ai"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  operator_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  pid INTEGER,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  FOREIGN KEY (operator_id) REFERENCES operators(id)
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  operator_id TEXT NOT NULL,
  input TEXT NOT NULL,
  output TEXT NOT NULL DEFAULT '',
  exit_code INTEGER,
  executed_at INTEGER NOT NULL,
  duration_ms REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (operator_id) REFERENCES operators(id)
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

export function getDb(dbPath: string) {
  if (_db) return _db;

  mkdirSync(dirname(dbPath), { recursive: true });
  _sqlite = new Database(dbPath);
  _sqlite.pragma('journal_mode = WAL');
  _sqlite.pragma('foreign_keys = ON');
  _sqlite.exec(INIT_SQL);

  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function runMigrations(_db: ReturnType<typeof getDb>) {
  // Tables are created in getDb via INIT_SQL — nothing more to do here.
}

export type Db = ReturnType<typeof getDb>;
