/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initializeAppMock = vi.fn();
const certMock = vi.fn((sa) => ({ __cert: sa }));
const getAppsMock = vi.fn(() => []);
const getAuthMock = vi.fn(() => ({}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: initializeAppMock,
  cert: certMock,
  getApps: getAppsMock,
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: getAuthMock,
}));

describe('src/lib/firebase-admin.ts - hasAdminCredentials e inicialização', () => {
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

  it('retorna false quando não há FIREBASE_SERVICE_ACCOUNT, BASE64 nem K_SERVICE e inicializa apenas com projectId', async () => {
    const { hasAdminCredentials } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(false);
    expect(certMock).not.toHaveBeenCalled();
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledWith({
      projectId: expect.any(String),
    });
  });

  it('retorna true quando K_SERVICE está definido (Cloud Run / AI Studio)', async () => {
    process.env.K_SERVICE = 'rotulofacil-preview';
    const { hasAdminCredentials } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(true);
    expect(certMock).not.toHaveBeenCalled();
    expect(initializeAppMock).toHaveBeenCalledTimes(1);
  });

  it('retorna true quando FIREBASE_SERVICE_ACCOUNT está definida em JSON', async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
      project_id: 'proj-teste',
      client_email: 'sa@proj-teste.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    });

    const { hasAdminCredentials } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(true);
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

    const { hasAdminCredentials } = await import('./firebase-admin');

    expect(hasAdminCredentials()).toBe(true);
    expect(certMock).toHaveBeenCalledTimes(1);
    expect(initializeAppMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-b64',
      })
    );
  });
});
