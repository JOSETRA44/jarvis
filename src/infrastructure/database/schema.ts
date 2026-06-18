import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const operators = sqliteTable('operators', {
  id: text('id').primaryKey(),
  platform: text('platform', { enum: ['whatsapp', 'telegram'] }).notNull(),
  identifier: text('identifier').notNull(),
  displayName: text('display_name').notNull(),
  permissions: text('permissions').notNull().default('["ai"]'),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  platform: text('platform', { enum: ['whatsapp', 'telegram'] }).notNull(),
  pid: integer('pid'),
  cwd: text('cwd').notNull(),
  status: text('status', { enum: ['active', 'idle', 'closed'] }).notNull().default('active'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  lastActivityAt: integer('last_activity_at', { mode: 'timestamp_ms' }).notNull(),
});

export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => sessions.id),
  operatorId: text('operator_id').notNull().references(() => operators.id),
  input: text('input').notNull(),
  output: text('output').notNull().default(''),
  exitCode: integer('exit_code'),
  executedAt: integer('executed_at', { mode: 'timestamp_ms' }).notNull(),
  durationMs: real('duration_ms').notNull().default(0),
});

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});
