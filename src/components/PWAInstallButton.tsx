/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Share, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isVisible, canInstallPrompt, showIOSHint, promptInstall } =
    usePWAInstall();
  const [isIOSModalOpen, setIsIOSModalOpen] = useState(false);

  if (!isVisible) {
    return null;
  }

  const handleClick = async () => {
    if (canInstallPrompt) {
      await promptInstall();
      return;
    }
    if (showIOSHint) {
      setIsIOSModalOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="py-1.5 px-2 sm:px-2.5 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
        title="Instalar RótuloFácil como aplicativo"
      >
        <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
        <span className="hidden sm:inline">Instalar app</span>
        <span className="sm:hidden">Instalar</span>
      </button>

      {isIOSModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-4 sm:p-5 space-y-4 max-h-[calc(100vh-24px)] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                  Instalar no iPhone / iPad
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsIOSModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0 cursor-pointer"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2.5 leading-relaxed">
              <p className="flex items-start gap-2">
                <Share className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Toque em <strong>Compartilhar</strong> e depois em{' '}
                  <strong>Adicionar à Tela de Início</strong>.
                </span>
              </p>
              <p className="text-[11px] text-slate-500">
                O ícone do RótuloFácil aparecerá na sua tela inicial para abrir em tela cheia como aplicativo.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsIOSModalOpen(false)}
                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
