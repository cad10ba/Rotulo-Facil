/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeAppMock = vi.fn();
const certMock = vi.fn((sa) => ({ __cert: sa }));
const getAppsMock = vi.fn(() => []);
const getAuthMock = vi.fn(() => ({ verifyIdToken: vi.fn() }));

vi.mock('firebase-admin/app', () => ({
  initializeApp: initializeAppMock,
  cert: certMock,
  getApps: getAppsMock,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: getAuthMock,
}));

describe('src/lib/firebase-admin.ts - hasAdminCredentials e getAdminAuth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    delete process.env.K_SERVICE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('retorna false quando não há FIREBASE_SERVICE_ACCOUNT, BASE64 nem K_SERVICE e recusa getAdminAuth', async () => {
    const { hasAdminCredentials, getAdminAuth } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(false);
    expect(initializeAppMock).not.toHaveBeenCalled();
    await expect(getAdminAuth()).rejects.toThrow();
  });

  it('retorna true quando K_SERVICE está definido (Cloud Run / AI Studio) e inicializa sob demanda', async () => {
    process.env.K_SERVICE = 'rotulofacil-preview';
    const { hasAdminCredentials, getAdminAuth } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(true);
    expect(initializeAppMock).not.toHaveBeenCalled();

    await getAdminAuth();
    expect(certMock).not.toHaveBeenCalled();
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledWith({
      projectId: expect.any(String),
    });
  });

  it('retorna true quando FIREBASE_SERVICE_ACCOUNT está definida em JSON', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'proj-teste',
      client_email: 'sa@proj-teste.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });

    const { hasAdminCredentials, getAdminAuth } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(true);
    await getAdminAuth();
    expect(certMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-teste',
      })
    );
  });

  it('retorna true quando FIREBASE_SERVICE_ACCOUNT_BASE64 está definida', async () => {
    const json = JSON.stringify({
      project_id: 'proj-b64',
      client_email: 'sa@proj-b64.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 = Buffer.from(json, 'utf8').toString('base64');

    const { hasAdminCredentials, getAdminAuth } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(true);
    await getAdminAuth();
    expect(certMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-b64',
      })
    );
  });
});
