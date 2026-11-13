/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, CheckCircle2, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';

interface AnvisaGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AnvisaGuideModal: React.FC<AnvisaGuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Guia Rápido ANVISA (RDC 429/2020 & IN 75/2020)
              </h3>
              <p className="text-xs text-slate-500">
                Normas obrigatórias de rotulagem nutricional no Brasil
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-700 leading-relaxed">
          {/* Item 1 */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              1. As Novas 3 Colunas Obrigatórias
            </h4>
            <p>
              A nova rotulagem exige obrigatoriamente a declaração por <strong>100 g (ou 100 ml)</strong> ao lado da <strong>porção do produto</strong> e do <strong>%VD</strong>. Isso permite que os consumidores comparem facilmente alimentos de marcas e tamanhos diferentes.
            </p>
          </div>

          {/* Item 2 */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              2. Açúcares Adicionados (Novidade Central)
            </h4>
            <p>
              Agora é obrigatório discriminar <strong>Açúcares totais</strong> e <strong>Açúcares adicionados</strong> (indentados logo abaixo de Carboidratos). Açúcares adicionados são todos aqueles colocados durante o preparo (açúcar cristal, refinado, xaropes, mel, glicose, melaço).
            </p>
          </div>

          {/* Item 3 */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              3. Rotulagem Nutricional Frontal (Lupa ANVISA)
            </h4>
            <p className="mb-2">
              Se o alimento atingir ou ultrapassar os limites por 100g/100ml, é obrigatório estampar a lupa frontal no painel principal:
            </p>
            <ul className="list-disc pl-5 space-y-1 font-medium text-slate-800">
              <li>
                <strong>Açúcar Adicionado:</strong> ≥ 15 g/100 g (sólidos) ou ≥ 7,5 g/100 ml (líquidos)
              </li>
              <li>
                <strong>Gordura Saturada:</strong> ≥ 6 g/100 g (sólidos) ou ≥ 3 g/100 ml (líquidos)
              </li>
              <li>
                <strong>Sódio:</strong> ≥ 600 mg/100 g (sólidos) ou ≥ 300 mg/100 ml (líquidos)
              </li>
            </ul>
          </div>

          {/* Item 4 */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              4. Padrão Visual (Fundo Branco e Texto Preto)
            </h4>
            <p>
              A ANVISA estabelece que a tabela nutricional deve ter <strong>fundo estritamente branco</strong> e <strong>letras/bordas pretas</strong> para assegurar alto contraste e legibilidade, utilizando fontes sem serifa (como Arial ou Helvetica).
            </p>
          </div>

          {/* Item 5 */}
          <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50">
            <h4 className="font-bold text-slate-900 text-sm mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              5. Tabela TACO (UNICAMP)
            </h4>
            <p>
              A Tabela Brasileira de Composição de Alimentos (TACO) é o padrão ouro nacional oficial elaborado pela UNICAMP com o Ministério da Saúde para dados nutricionais de ingredientes e receitas no Brasil.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition"
          >
            Entendi, fechar
          </button>
        </div>
      </div>
    </div>
  );
};
