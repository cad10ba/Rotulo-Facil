/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sql } from 'drizzle-orm';
import { pgSchema, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// A estrutura do banco (tabelas, triggers e RLS) é mantida diretamente por script SQL no Supabase.
// Este arquivo serve apenas para tipar as consultas do Drizzle.
export const rotuloSchema = pgSchema('rotulo');

export const users = rotuloSchema.table('users', {
  uid: text('uid').primaryKey(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
});

export const recipes = rotuloSchema.table('recipes', {
  id: uuid('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .default(sql`rotulo.current_uid()`)
    .references(() => users.uid, { onDelete: 'cascade' }),
  payloadEnc: text('payload_enc').notNull(),
  keyVersion: smallint('key_version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
