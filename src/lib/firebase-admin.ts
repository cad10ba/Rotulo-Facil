/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ServiceAccount } from 'firebase-admin/app';
import type { Auth } from 'firebase-admin/auth';
import { firebaseConfig } from './firebaseConfig.ts';

type ServiceAccountJson = ServiceAccount & {
  project_id?: string;
  projectId?: string;
};

export function hasAdminCredentials(): boolean {
  const hasServiceAccountJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT?.trim());
  const hasServiceAccountBase64 = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim());
  const hasCloudRunEnv = Boolean(process.env.K_SERVICE?.trim());
  return hasServiceAccountJson || hasServiceAccountBase64 || hasCloudRunEnv;
}

function parseServiceAccountFromEnv(): ServiceAccountJson | null {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  const rawBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();

  if (!rawJson && !rawBase64) {
    return null;
  }

  try {
    const decoded = rawJson
      ? rawJson
      : Buffer.from(rawBase64!, 'base64').toString('utf8');
    return JSON.parse(decoded) as ServiceAccountJson;
  } catch {
    throw new Error(
      'Configuração inválida de credencial Firebase Admin (FIREBASE_SERVICE_ACCOUNT / FIREBASE_SERVICE_ACCOUNT_BASE64).'
    );
  }
}

let adminAuthPromise: Promise<Auth> | null = null;

/**
 * Carrega firebase-admin dinamicamente somente quando houver credenciais Admin
 * (Cloud Run ou FIREBASE_SERVICE_ACCOUNT), evitando require() de ESM na Vercel.
 */
export async function getAdminAuth(): Promise<Auth> {
  if (!hasAdminCredentials()) {
    throw new Error('Credenciais do Firebase Admin não configuradas neste ambiente.');
  }

  if (!adminAuthPromise) {
    adminAuthPromise = (async () => {
      const [{ cert, getApps, initializeApp }, { getAuth }] = await Promise.all([
        import('firebase-admin/app'),
        import('firebase-admin/auth'),
      ]);

      if (!getApps().length) {
        const serviceAccount = parseServiceAccountFromEnv();
        if (serviceAccount) {
          initializeApp({
            credential: cert(serviceAccount),
            projectId:
              serviceAccount.projectId || serviceAccount.project_id || firebaseConfig.projectId,
          });
        } else {
          initializeApp({
            projectId: firebaseConfig.projectId,
          });
        }
      }

      return getAuth();
    })().catch((err) => {
      adminAuthPromise = null;
      throw err;
    });
  }

  return adminAuthPromise;
}
