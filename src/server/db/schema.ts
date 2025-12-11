// Example model schema from the Drizzle docs
// https://orm.drizzle.team/docs/sql-schema-declaration

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const customerTable = sqliteTable('customer', {
  customerId: integer('customerId').primaryKey(),
  companyName: text('companyName').notNull(),
  contactName: text('contactName').notNull(),
});

// RAGシステム用のテーブル
export const documentsTable = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  userId: text('userId').notNull(), // SupabaseのユーザーID
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const documentChunksTable = sqliteTable('document_chunks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  documentId: integer('documentId').notNull().references(() => documentsTable.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  embedding: text('embedding'), // JSON形式でベクトルを保存
  chunkIndex: integer('chunkIndex').notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const threadsTable = sqliteTable('threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: text('threadId').notNull().unique(), // OpenAIのThread ID
  userId: text('userId').notNull(), // SupabaseのユーザーID
  title: text('title'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

export const messagesTable = sqliteTable('messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('threadId').notNull().references(() => threadsTable.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // 'user' or 'assistant'
  content: text('content').notNull(),
  messageId: text('messageId'), // OpenAIのMessage ID
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
