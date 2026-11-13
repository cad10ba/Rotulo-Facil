/**
 * Criptografia de dados das receitas (AES-256-GCM) – RótuloFácil
 *
 * - A chave fica só no servidor (Secrets do AI Studio), nunca no banco nem no navegador.
 * - Cada registro usa um IV aleatório de 12 bytes.
 * - O texto cifrado fica "amarrado" ao dono e ao id da receita (AAD = uid|recipeId):
 *   se alguém copiar o payload de uma receita para outra linha ou outro usuário,
 *   a decifragem falha.
 * - Suporta troca de chave: DATA_ENCRYPTION_KEY (atual) e DATA_ENCRYPTION_KEY_PREVIOUS (antiga).
 *
 * Formato salvo em payload_enc:  v<versão>:<iv base64>:<tag base64>:<dados base64>
 *
 * Gerar uma chave (rode uma vez e guarde nos Secrets):
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

interface KeyEntry {
  version: number;
  key: Buffer;
}

function parseKey(envName: string, version: number): KeyEntry | null {
  const raw = process.env[envName];
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${envName} deve ter 32 bytes em base64 (44 caracteres).`);
  }
  return { version, key };
}

function loadKeys(): { current: KeyEntry; all: Map<number, Buffer> } {
  const currentVersion = Number(process.env.DATA_ENCRYPTION_KEY_VERSION || '1');
  const current = parseKey('DATA_ENCRYPTION_KEY', currentVersion);
  if (!current) {
    throw new Error('DATA_ENCRYPTION_KEY não configurada. O servidor não pode iniciar sem ela.');
  }
  const all = new Map<number, Buffer>([[current.version, current.key]]);
  const previous = parseKey('DATA_ENCRYPTION_KEY_PREVIOUS', currentVersion - 1);
  if (previous && previous.version > 0) all.set(previous.version, previous.key);
  return { current, all };
}

let keys: ReturnType<typeof loadKeys> | null = null;
function getKeys() {
  if (!keys) keys = loadKeys();
  return keys;
}

/** Chame no início do servidor para falhar cedo se a chave estiver ausente/errada. */
export function assertEncryptionConfigured(): void {
  getKeys();
}

function aad(userId: string, recipeId: string): Buffer {
  return Buffer.from(`${userId}|${recipeId}`, 'utf8');
}

export function encryptJson(data: unknown, userId: string, recipeId: string): { payload: string; keyVersion: number } {
  const { current } = getKeys();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, current.key, iv);
  cipher.setAAD(aad(userId, recipeId));
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = [`v${current.version}`, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
  return { payload, keyVersion: current.version };
}

export function decryptJson<T = unknown>(payload: string, userId: string, recipeId: string): T {
  const parts = payload.split(':');
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new Error('Formato de dado criptografado inválido.');
  }
  const version = Number(parts[0].slice(1));
  const key = getKeys().all.get(version);
  if (!key) throw new Error(`Chave de criptografia versão ${version} indisponível.`);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(parts[1], 'base64'));
  decipher.setAAD(aad(userId, recipeId));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

/** true se o registro foi cifrado com uma chave antiga e deve ser regravado com a atual. */
export function needsReencryption(payload: string): boolean {
  return !payload.startsWith(`v${getKeys().current.version}:`);
}
