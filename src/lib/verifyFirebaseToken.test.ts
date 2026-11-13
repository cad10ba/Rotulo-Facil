/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { firebaseConfig } from './firebaseConfig';

const PROJECT_ID = firebaseConfig.projectId;
const VALID_ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const TEST_KID = 'test-key-1';

describe('src/lib/verifyFirebaseToken.ts - Verificação ESM com jose sem credenciais Admin', () => {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  let privateKey: CryptoKey;
  let publicJwk: Record<string, unknown>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    delete process.env.K_SERVICE;

    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const jwk = await exportJWK(pair.publicKey);
    publicJwk = {
      ...jwk,
      kid: TEST_KID,
      alg: 'RS256',
      use: 'sig',
    };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('securetoken@system.gserviceaccount.com')) {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'public, max-age=3600',
          },
        });
      }
      throw new Error(`Fetch inesperado no teste: ${url}`);
    }) as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function createToken(overrides: {
    sub?: string;
    issuer?: string;
    audience?: string;
    expSecondsFromNow?: number;
    authTimeSecondsFromNow?: number;
    email?: string;
    emailVerified?: boolean;
    signInProvider?: string;
  } = {}) {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({
      auth_time: now + (overrides.authTimeSecondsFromNow ?? -30),
      email: overrides.email ?? 'usuario@teste.com',
      email_verified: overrides.emailVerified ?? true,
      name: 'Usuário Teste',
      firebase: {
        sign_in_provider: overrides.signInProvider ?? 'password',
      },
    })
      .setProtectedHeader({ alg: 'RS256', kid: TEST_KID })
      .setIssuedAt(now - 30)
      .setExpirationTime(now + (overrides.expSecondsFromNow ?? 3600))
      .setIssuer(overrides.issuer ?? VALID_ISSUER)
      .setAudience(overrides.audience ?? PROJECT_ID);

    if (overrides.sub !== undefined) {
      jwt.setSubject(overrides.sub);
    } else {
      jwt.setSubject('uid-usuario-123');
    }

    return jwt.sign(privateKey);
  }

  it('valida token Firebase legítimo sem credenciais Admin e retorna dados compatíveis', async () => {
    const { verifyFirebaseIdToken } = await import('./verifyFirebaseToken');
    const token = await createToken();

    const decoded = await verifyFirebaseIdToken(token);
    expect(decoded).toEqual({
      uid: 'uid-usuario-123',
      email: 'usuario@teste.com',
      email_verified: true,
      name: 'Usuário Teste',
      firebase: {
        sign_in_provider: 'password',
      },
    });
  });

  it('rejeita token com issuer errado', async () => {
    const { verifyFirebaseIdToken } = await import('./verifyFirebaseToken');
    const token = await createToken({
      issuer: 'https://securetoken.google.com/outro-projeto',
    });

    await expect(verifyFirebaseIdToken(token)).rejects.toThrow();
  });

  it('rejeita token com audience errada', async () => {
    const { verifyFirebaseIdToken } = await import('./verifyFirebaseToken');
    const token = await createToken({
      audience: 'outro-projeto-id',
    });

    await expect(verifyFirebaseIdToken(token)).rejects.toThrow();
  });

  it('rejeita token expirado', async () => {
    const { verifyFirebaseIdToken } = await import('./verifyFirebaseToken');
    const token = await createToken({
      expSecondsFromNow: -120,
    });

    await expect(verifyFirebaseIdToken(token)).rejects.toThrow();
  });

  it('rejeita token com sub vazio, sub maior que 128 caracteres ou auth_time no futuro', async () => {
    const { verifyFirebaseIdToken } = await import('./verifyFirebaseToken');

    const emptySub = await createToken({ sub: '' });
    await expect(verifyFirebaseIdToken(emptySub)).rejects.toThrow();

    const longSub = await createToken({ sub: 'a'.repeat(129) });
    await expect(verifyFirebaseIdToken(longSub)).rejects.toThrow();

    const futureAuthTime = await createToken({ authTimeSecondsFromNow: 600 });
    await expect(verifyFirebaseIdToken(futureAuthTime)).rejects.toThrow();
  });
});
