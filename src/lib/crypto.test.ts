/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY_V1 = randomBytes(32).toString('base64');
const KEY_V2 = randomBytes(32).toString('base64');

describe('src/lib/crypto.ts - AES-256-GCM com AAD e rotação de chave', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.DATA_ENCRYPTION_KEY = KEY_V1;
    process.env.DATA_ENCRYPTION_KEY_VERSION = '1';
    delete process.env.DATA_ENCRYPTION_KEY_PREVIOUS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('cifra e decifra um objeto JSON preservando os dados', async () => {
    const { assertEncryptionConfigured, encryptJson, decryptJson, needsReencryption } =
      await import('./crypto');

    assertEncryptionConfigured();
    const sample = {
      name: 'Bolo Integral',
      portionSize: 60,
      ingredients: [{ id: 'ing-1', name: 'Farinha de trigo', grams: 200 }],
      exportTermsAccepted: true,
    };

    const { payload, keyVersion } = encryptJson(
      sample,
      'uid-user-1',
      '11111111-1111-4111-8111-111111111111'
    );

    expect(keyVersion).toBe(1);
    expect(payload.startsWith('v1:')).toBe(true);
    expect(needsReencryption(payload)).toBe(false);

    const decrypted = decryptJson<typeof sample>(
      payload,
      'uid-user-1',
      '11111111-1111-4111-8111-111111111111'
    );
    expect(decrypted).toEqual(sample);
  });

  it('falha ao decifrar com outro uid (AAD)', async () => {
    const { encryptJson, decryptJson } = await import('./crypto');
    const recipeId = '22222222-2222-4222-8222-222222222222';
    const { payload } = encryptJson({ name: 'Receita Secreta' }, 'uid-a', recipeId);

    expect(() => decryptJson(payload, 'uid-b', recipeId)).toThrow();
  });

  it('falha ao decifrar com outro recipeId (AAD)', async () => {
    const { encryptJson, decryptJson } = await import('./crypto');
    const { payload } = encryptJson(
      { name: 'Receita Secreta' },
      'uid-a',
      '33333333-3333-4333-8333-333333333333'
    );

    expect(() =>
      decryptJson(payload, 'uid-a', '44444444-4444-4444-8444-444444444444')
    ).toThrow();
  });

  it('detecta adulteração no texto cifrado, IV ou tag', async () => {
    const { encryptJson, decryptJson } = await import('./crypto');
    const uid = 'uid-a';
    const recipeId = '55555555-5555-4555-8555-555555555555';
    const { payload } = encryptJson({ name: 'Pão Francês' }, uid, recipeId);

    const parts = payload.split(':');
    const tamperedCipher = Buffer.from(parts[3], 'base64');
    tamperedCipher[0] = tamperedCipher[0] ^ 0xff;
    const tamperedPayload = [parts[0], parts[1], parts[2], tamperedCipher.toString('base64')].join(
      ':'
    );

    expect(() => decryptJson(tamperedPayload, uid, recipeId)).toThrow();

    const tamperedTag = Buffer.from(parts[2], 'base64');
    tamperedTag[0] = tamperedTag[0] ^ 0xff;
    const tamperedTagPayload = [parts[0], parts[1], tamperedTag.toString('base64'), parts[3]].join(
      ':'
    );

    expect(() => decryptJson(tamperedTagPayload, uid, recipeId)).toThrow();
  });

  it('lê dados cifrados com a chave anterior após rotação e sinaliza re-criptografia', async () => {
    const uid = 'uid-rotacao';
    const recipeId = '66666666-6666-4666-8666-666666666666';
    const data = { name: 'Granola Caseira', density: 1 };

    const cryptoV1 = await import('./crypto');
    const { payload: v1Payload } = cryptoV1.encryptJson(data, uid, recipeId);
    expect(v1Payload.startsWith('v1:')).toBe(true);

    // Simula rotação para v2 mantendo v1 em DATA_ENCRYPTION_KEY_PREVIOUS
    vi.resetModules();
    process.env.DATA_ENCRYPTION_KEY = KEY_V2;
    process.env.DATA_ENCRYPTION_KEY_VERSION = '2';
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = KEY_V1;

    const cryptoV2 = await import('./crypto');
    expect(cryptoV2.needsReencryption(v1Payload)).toBe(true);

    const decrypted = cryptoV2.decryptJson<typeof data>(v1Payload, uid, recipeId);
    expect(decrypted).toEqual(data);

    const { payload: v2Payload, keyVersion } = cryptoV2.encryptJson(decrypted, uid, recipeId);
    expect(keyVersion).toBe(2);
    expect(v2Payload.startsWith('v2:')).toBe(true);
    expect(cryptoV2.needsReencryption(v2Payload)).toBe(false);
    expect(cryptoV2.decryptJson<typeof data>(v2Payload, uid, recipeId)).toEqual(data);
  });
});
