/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAdminAuth, hasAdminCredentials } from './firebase-admin.ts';
import { firebaseConfig } from './firebaseConfig.ts';

export interface VerifiedFirebaseToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  firebase?: {
    sign_in_provider?: string;
  };
}

const GOOGLE_FIREBASE_JWKS_URL = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
);

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!cachedJwks) {
    cachedJwks = createRemoteJWKSet(GOOGLE_FIREBASE_JWKS_URL);
  }
  return cachedJwks;
}

export async function verifyFirebaseIdToken(token: string): Promise<VerifiedFirebaseToken> {
  if (hasAdminCredentials()) {
    const adminAuth = await getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      email_verified: decoded.email_verified,
      name: typeof decoded.name === 'string' ? decoded.name : undefined,
      firebase: decoded.firebase
        ? { sign_in_provider: decoded.firebase.sign_in_provider }
        : undefined,
    };
  }

  const projectId = firebaseConfig.projectId;
  const { payload } = await jwtVerify(token, getJwks(), {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
    algorithms: ['RS256'],
  });

  if (
    typeof payload.sub !== 'string' ||
    payload.sub.trim().length === 0 ||
    payload.sub.length > 128
  ) {
    throw new Error('Token Firebase sem sub válido.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    typeof payload.auth_time !== 'number' ||
    !Number.isFinite(payload.auth_time) ||
    payload.auth_time > nowSeconds
  ) {
    throw new Error('Token Firebase com auth_time inválido.');
  }

  const firebaseClaim =
    payload.firebase && typeof payload.firebase === 'object'
      ? (payload.firebase as { sign_in_provider?: unknown })
      : undefined;

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    email_verified:
      typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    firebase:
      firebaseClaim && typeof firebaseClaim.sign_in_provider === 'string'
        ? { sign_in_provider: firebaseClaim.sign_in_provider }
        : undefined,
  };
}
