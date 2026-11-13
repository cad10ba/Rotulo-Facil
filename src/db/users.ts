/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { eq, sql } from 'drizzle-orm';
import { withUserRls } from './index.ts';
import { users } from './schema.ts';

export const USER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

const userCache = new Map<string, number>();

export function clearUserCache(uid?: string): void {
  if (uid) {
    userCache.delete(uid);
  } else {
    userCache.clear();
  }
}

function pruneExpiredEntries(now: number): void {
  if (userCache.size <= 5000) return;
  for (const [key, expiresAt] of userCache.entries()) {
    if (expiresAt <= now) {
      userCache.delete(key);
    }
  }
}

/**
 * Garante que o usuário exista em rotulo.users e atualiza last_seen_at,
 * usando cache em memória por uid com TTL de 10 minutos.
 * Não armazena e-mail nem nome no banco.
 */
export async function ensureUser(uid: string): Promise<void> {
  const now = Date.now();
  const expiresAt = userCache.get(uid);

  if (expiresAt !== undefined && expiresAt > now) {
    return;
  }

  try {
    await withUserRls(uid, async (tx) => {
      await tx.execute(
        sql`insert into rotulo.users (uid) values (${uid}) on conflict (uid) do update set last_seen_at = now()`
      );
    });

    pruneExpiredEntries(now);
    userCache.set(uid, now + USER_CACHE_TTL_MS);
  } catch (error) {
    console.error(
      'Falha ao sincronizar usuário no banco:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao sincronizar dados do usuário.', { cause: error });
  }
}

/**
 * Remove o registro do usuário em rotulo.users (receitas são removidas em cascata).
 */
export async function deleteUserAccountData(uid: string): Promise<void> {
  try {
    await withUserRls(uid, async (tx) => {
      await tx.delete(users).where(eq(users.uid, uid));
    });
    clearUserCache(uid);
  } catch (error) {
    console.error(
      'Falha ao remover dados do usuário no banco:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao excluir dados da conta.', { cause: error });
  }
}
