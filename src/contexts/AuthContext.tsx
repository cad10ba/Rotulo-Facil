/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  isVerified: boolean;
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (name: string, email: string, password: string) => Promise<{ verificationSent: boolean; warning?: string }>;
  resendVerificationEmail: () => Promise<{ sent: boolean; message: string }>;
  refreshVerificationStatus: () => Promise<boolean>;
  requestPasswordReset: (email: string) => Promise<string>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setVersion] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const isPasswordProvider = Boolean(
    user?.providerData?.some((p) => p.providerId === 'password')
  );
  // Usuários Google já possuem e-mail verificado; contas por senha precisam confirmar pelo link do Brevo
  const isVerified = Boolean(user && (!isPasswordProvider || user.emailVerified));

  const getToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return auth.currentUser.getIdToken(forceRefresh);
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
  };

  const signInWithEmail = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
    await credential.user.reload();
    setUser(auth.currentUser);
    setVersion((v) => v + 1);
  };

  const signUpWithEmail = async (
    name: string,
    email: string,
    password: string
  ): Promise<{ verificationSent: boolean; warning?: string }> => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (name.trim()) {
      await updateProfile(credential.user, { displayName: name.trim() });
    }
    const token = await credential.user.getIdToken(true);

    const res = await fetch('/api/auth/send-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        verificationSent: false,
        warning:
          data.error ||
          'Conta criada, mas não foi possível enviar o link de confirmação pelo Brevo no momento.',
      };
    }

    if (data.useClientFallback) {
      try {
        await sendEmailVerification(credential.user, { url: window.location.origin });
        return { verificationSent: true };
      } catch {
        return {
          verificationSent: false,
          warning:
            'Conta criada, mas não foi possível enviar o link de confirmação no momento.',
        };
      }
    }

    return { verificationSent: Boolean(data.sent) };
  };

  const resendVerificationEmail = async (): Promise<{ sent: boolean; message: string }> => {
    const token = await getToken(true);
    if (!token) {
      throw new Error('Sessão expirada. Entre novamente.');
    }

    const res = await fetch('/api/auth/send-verification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao reenviar e-mail de confirmação via Brevo.');
    }

    if (data.useClientFallback) {
      if (!auth.currentUser) {
        throw new Error('Sessão expirada. Entre novamente.');
      }
      await sendEmailVerification(auth.currentUser, { url: window.location.origin });
      return {
        sent: true,
        message: `Link de confirmação reenviado para ${auth.currentUser.email || user?.email}.`,
      };
    }

    if (data.alreadyVerified) {
      await auth.currentUser?.reload();
      setUser(auth.currentUser);
      setVersion((v) => v + 1);
      return { sent: false, message: 'Seu e-mail já está confirmado!' };
    }

    return {
      sent: true,
      message: `Link de confirmação reenviado via Brevo para ${data.email || user?.email}.`,
    };
  };

  const refreshVerificationStatus = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setUser(auth.currentUser);
    setVersion((v) => v + 1);
    return Boolean(auth.currentUser.emailVerified);
  };

  const requestPasswordReset = async (email: string): Promise<string> => {
    const cleanEmail = email.trim();
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível enviar o e-mail de redefinição via Brevo.');
    }
    if (data.useClientFallback) {
      await sendPasswordResetEmail(auth, cleanEmail, { url: window.location.origin });
      return 'Se existir uma conta para este e-mail, enviamos o link de redefinição de senha.';
    }
    return (
      data.message ||
      'Enviamos um link de redefinição de senha via Brevo para o seu e-mail.'
    );
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isVerified,
        getToken,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resendVerificationEmail,
        refreshVerificationStatus,
        requestPasswordReset,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider');
  }
  return ctx;
}
