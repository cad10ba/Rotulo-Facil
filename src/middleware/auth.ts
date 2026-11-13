/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { adminAuth, hasAdminCredentials } from '../lib/firebase-admin.ts';
import { ensureUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Sessão não autenticada. Faça login para continuar.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token, hasAdminCredentials());

    // Exige confirmação de e-mail para provedores por senha (Google já vem com email_verified = true)
    const signInProvider = decodedToken.firebase?.sign_in_provider;
    if (signInProvider === 'password' && !decodedToken.email_verified) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        error: 'Confirme seu e-mail pelo link enviado via Brevo antes de acessar suas receitas.',
      });
    }

    await ensureUser(decodedToken.uid);

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error(
      'Falha ao verificar token Firebase:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Entre novamente.' });
  }
};
