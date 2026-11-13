/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
  var _supabaseSslWarned: boolean | undefined;
}

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function resolveSupabaseCaPath(): string {
  const fromModule = path.resolve(PROJECT_ROOT, 'certs', 'supabase-prod-ca-2021.crt');
  if (fs.existsSync(fromModule)) {
    return fromModule;
  }
  return path.resolve(process.cwd(), 'certs', 'supabase-prod-ca-2021.crt');
}

function resolveSslConfig(): { ca?: string | string[]; rejectUnauthorized: boolean } {
  const rawCa = process.env.SUPABASE_DB_SSL_CA?.trim();
  if (rawCa) {
    const normalizedCa = rawCa.includes('\\n') ? rawCa.replace(/\\n/g, '\n') : rawCa;
    return { ca: normalizedCa, rejectUnauthorized: true };
  }

  const caPath = resolveSupabaseCaPath();
  if (fs.existsSync(caPath)) {
    const supabaseCa = fs.readFileSync(caPath, 'utf8');
    return {
      ca: [supabaseCa, ...tls.rootCertificates],
      rejectUnauthorized: true,
    };
  }

  if (!global._supabaseSslWarned) {
    global._supabaseSslWarned = true;
    console.warn(
      'Aviso: SUPABASE_DB_SSL_CA não definida e certs/supabase-prod-ca-2021.crt não encontrado; certificado SSL do servidor Supabase não está sendo verificado.'
    );
  }
  return { rejectUnauthorized: false };
}

function getPool(): Pool {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SUPABASE_DB_HOST,
      port: Number(process.env.SUPABASE_DB_PORT || 5432),
      user: process.env.SUPABASE_DB_USER,
      password: process.env.SUPABASE_DB_PASSWORD,
      database: process.env.SUPABASE_DB_NAME,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
      ssl: resolveSslConfig(),
    });

    global._postgresPool.on('error', (err) => {
      console.error(
        'Erro inesperado em cliente ocioso do pool PostgreSQL:',
        err instanceof Error ? err.message : 'Erro desconhecido'
      );
    });
  }
  return global._postgresPool;
}

const db = drizzle(getPool(), { schema });

export type DbClient = typeof db;
export type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * Verificação de inicialização (única consulta permitida fora de withUserRls):
 * garante que o usuário de banco configurado não ignora políticas RLS.
 */
export async function verifyDatabaseRlsRole(): Promise<void> {
  const pool = getPool();
  const result = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'select rolsuper, rolbypassrls from pg_roles where rolname = current_user'
  );
  const role = result.rows[0];
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      'O aplicativo não pode usar um usuário de banco de dados que ignora RLS (rolsuper ou rolbypassrls ativo).'
    );
  }
}

/**
 * Executa todas as operações de banco dentro de uma transação com o UID autenticado
 * definido em `app.current_user_uid` (escopo local da transação), ativando o RLS no Supabase.
 */
export async function withUserRls<T>(
  uid: string,
  fn: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  if (typeof uid !== 'string' || uid.trim().length === 0 || uid.length > 128) {
    throw new Error('UID de usuário inválido para contexto RLS.');
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_uid', ${uid}, true)`);
    return fn(tx);
  });
}
