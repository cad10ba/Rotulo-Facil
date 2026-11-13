/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Mail,
  Lock,
  User as UserIcon,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PWAInstallButton } from './PWAInstallButton';
import { AppLogo } from './AppLogo';

type AuthMode = 'login' | 'signup' | 'forgot';

function mapAuthError(err: any): string {
  const code = err?.code || '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha incorretos. Se não conseguir entrar com sua senha antiga, use "Esqueci minha senha".';
    case 'auth/email-already-in-use':
      return 'Este e-mail já possui uma conta cadastrada. Tente entrar ou recuperar sua senha.';
    case 'auth/weak-password':
      return 'A senha deve ter pelo menos 6 caracteres.';
    case 'auth/invalid-email':
      return 'Informe um endereço de e-mail válido.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.';
    case 'auth/popup-closed-by-user':
      return 'Login com Google cancelado antes da conclusão.';
    case 'auth/operation-not-allowed':
      return 'O login por E-mail/Senha precisa estar ativado no Firebase Authentication, ou entre diretamente com sua conta Google abaixo.';
    default:
      return err?.message || 'Não foi possível concluir a autenticação.';
  }
}

export const AuthScreen: React.FC = () => {
  const {
    user,
    isVerified,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    refreshVerificationStatus,
    requestPasswordReset,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Tela de bloqueio aguardando confirmação do link enviado via Brevo
  if (user && !isVerified) {
    const handleCheckConfirmed = async () => {
      setSubmitting(true);
      setError(null);
      setInfoMessage(null);
      try {
        const confirmed = await refreshVerificationStatus();
        if (!confirmed) {
          setError(
            'Seu e-mail ainda não foi confirmado. Clique no link enviado pelo Brevo na sua caixa de entrada (ou spam) e tente novamente.'
          );
        }
      } catch (err: any) {
        setError(mapAuthError(err));
      } finally {
        setSubmitting(false);
      }
    };

    const handleResend = async () => {
      setSubmitting(true);
      setError(null);
      setInfoMessage(null);
      try {
        const result = await resendVerificationEmail();
        setInfoMessage(result.message);
      } catch (err: any) {
        setError(err?.message || 'Erro ao reenviar link de confirmação.');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-100/80 flex items-center justify-center p-3 sm:p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/90 shadow-lg p-4 sm:p-7 space-y-5">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Mail className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base sm:text-lg font-black text-slate-900 leading-tight break-words">
                Confirme seu e-mail para entrar
              </h1>
              <p className="text-xs text-slate-500 mt-0.5 break-words">
                Enviamos um link de confirmação via Brevo para{' '}
                <strong className="text-slate-800 break-all">{user.email}</strong>
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 leading-relaxed">
            Para proteger suas receitas, o acesso à plataforma é liberado somente após confirmar o link enviado para o seu e-mail.
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}

          {infoMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span className="min-w-0 break-words">{infoMessage}</span>
            </div>
          )}

          <div className="space-y-2.5">
            <button
              type="button"
              disabled={submitting}
              onClick={handleCheckConfirmed}
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 text-center shadow-xs transition cursor-pointer"
            >
              {submitting ? (
                <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              )}
              <span>Já confirmei meu e-mail</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={handleResend}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs flex items-center justify-center gap-2 text-center transition cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Reenviar link de confirmação (Brevo)</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full py-2 px-4 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Sair e usar outra conta</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfoMessage(null);

    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else if (mode === 'signup') {
        const result = await signUpWithEmail(name, email, password);
        if (result.warning) {
          setError(result.warning);
        } else if (result.verificationSent) {
          setInfoMessage('Link de confirmação enviado via Brevo! Verifique sua caixa de entrada.');
        }
      } else if (mode === 'forgot') {
        const msg = await requestPasswordReset(email);
        setInfoMessage(msg);
      }
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    setError(null);
    setInfoMessage(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(mapAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/80 flex flex-col items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200/90 shadow-lg p-4 sm:p-7 space-y-5">
        {/* Marca */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <AppLogo size={40} className="w-10 h-10 shrink-0 shadow-xs rounded-[22%]" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">
                  Rótulo<span className="text-emerald-600">Fácil</span>
                </h1>
                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ANVISA
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Acesse sua conta para salvar e gerenciar suas receitas
              </p>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        {/* Seletor de Modo */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
              setInfoMessage(null);
            }}
            className={`py-2 rounded-lg font-bold transition cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              setError(null);
              setInfoMessage(null);
            }}
            className={`py-2 rounded-lg font-bold transition cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Criar Conta
          </button>
        </div>

        {/* Mensagens de erro e sucesso */}
        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {infoMessage && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span className="min-w-0 break-words">{infoMessage}</span>
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Nome
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome ou nome da sua cozinha"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-sm text-slate-900"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              E-mail
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-sm text-slate-900"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Senha
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                  >
                    Esqueci minha senha
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-sm text-slate-900"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 text-center leading-snug shadow-xs transition cursor-pointer"
          >
            {submitting ? (
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
            ) : mode === 'forgot' ? (
              <KeyRound className="w-4 h-4 shrink-0" />
            ) : (
              <ArrowRight className="w-4 h-4 shrink-0" />
            )}
            <span>
              {mode === 'login'
                ? 'Entrar na minha conta'
                : mode === 'signup'
                ? 'Criar conta e enviar confirmação'
                : 'Enviar link de redefinição (Brevo)'}
            </span>
          </button>

          {mode === 'forgot' && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setInfoMessage(null);
              }}
              className="w-full py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
            >
              Voltar para o login
            </button>
          )}
        </form>

        {/* Divisor + Botão Google */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-[11px] uppercase">
            <span className="bg-white px-2.5 text-slate-400 font-semibold">ou</span>
          </div>
        </div>

        <button
          type="button"
          disabled={submitting}
          onClick={handleGoogleLogin}
          className="w-full py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm flex items-center justify-center gap-2.5 transition shadow-2xs cursor-pointer"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          <span>Continuar com Google</span>
        </button>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[11px] text-slate-500 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Suas receitas ficam protegidas e visíveis apenas na sua conta.</span>
        </div>
      </div>
    </div>
  );
};
