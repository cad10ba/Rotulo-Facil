/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

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

export const adminAuth = getAuth();
