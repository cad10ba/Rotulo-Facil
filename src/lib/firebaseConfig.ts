/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

const MODULE_PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

function resolveFirebaseConfigPath(): string {
  const fromCwd = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(MODULE_PROJECT_ROOT, 'firebase-applet-config.json');
}

let cachedConfig: FirebaseAppletConfig | null = null;

export function getFirebaseConfig(): FirebaseAppletConfig {
  if (!cachedConfig) {
    const raw = fs.readFileSync(resolveFirebaseConfigPath(), 'utf8');
    cachedConfig = JSON.parse(raw) as FirebaseAppletConfig;
  }
  return cachedConfig;
}

export const firebaseConfig: FirebaseAppletConfig = getFirebaseConfig();
