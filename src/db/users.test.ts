/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeMock = vi.fn();

vi.mock('./index.ts', () => ({
  withUserRls: vi.fn(async (_uid: string, fn: (tx: any) => Promise<any>) => {
    return fn({ execute: executeMock });
  }),
}));

import { USER_CACHE_TTL_MS, clearUserCache, ensureUser } from './users';

describe('ensureUser - Cache em memória por uid (TTL 10 min)', () => {
  beforeEach(() => {
    clearUserCache();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('retorna do cache em memória dentro do TTL de 10 minutos sem gravar no banco novamente', async () => {
    vi.useFakeTimers();
    const baseTime = new Date('2026-01-01T00:00:00.000Z');
    vi.setSystemTime(baseTime);

    executeMock.mockResolvedValue({ rowCount: 1 });

    await ensureUser('uid-1');
    expect(executeMock).toHaveBeenCalledTimes(1);

    // 5 minutos depois: deve retornar do cache sem executar query novamente
    vi.setSystemTime(new Date(baseTime.getTime() + 5 * 60 * 1000));
    await ensureUser('uid-1');
    expect(executeMock).toHaveBeenCalledTimes(1);

    // Após TTL (10 min + 1 ms): deve executar novamente no banco
    vi.setSystemTime(new Date(baseTime.getTime() + USER_CACHE_TTL_MS + 1));
    await ensureUser('uid-1');
    expect(executeMock).toHaveBeenCalledTimes(2);
  });
});
