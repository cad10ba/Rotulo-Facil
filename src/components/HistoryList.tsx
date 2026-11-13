/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Calendar,
  ArrowRight,
  Copy,
  Trash2,
  Plus,
  RefreshCw,
  Utensils,
} from 'lucide-react';
import { Recipe } from '../types/nutrition';

interface HistoryListProps {
  recipes: Recipe[];
  currentRecipeId: string;
  onSelectRecipe: (recipe: Recipe) => void;
  onDuplicateRecipe: (recipe: Recipe) => void;
  onDeleteRecipe: (id: string) => void;
  onNewRecipe: () => void;
  onRestoreSamples: () => void;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export const HistoryList: React.FC<HistoryListProps> = ({
  recipes,
  currentRecipeId,
  onSelectRecipe,
  onDuplicateRecipe,
  onDeleteRecipe,
  onNewRecipe,
  onRestoreSamples,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const normalizedQuery = normalizeText(searchTerm);

  const filtered = useMemo(() => {
    if (!normalizedQuery) return recipes;
    return recipes.filter(
      (r) =>
        normalizeText(r.name || '').includes(normalizedQuery) ||
        (r.category && normalizeText(r.category).includes(normalizedQuery))
    );
  }, [recipes, normalizedQuery]);

  return (
    <div className="space-y-5 pb-12">
      {/* Barra de Busca e Ação de Nova Receita */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar receita pelo nome..."
              aria-label="Buscar receita pelo nome"
              className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onRestoreSamples}
              className="py-2 px-3 text-xs font-semibold rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
              title="Recarregar exemplos oficiais da confeitaria e culinária brasileira"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Restaurar Exemplos</span>
            </button>

            <button
              type="button"
              onClick={onNewRecipe}
              className="flex-1 sm:flex-none py-2 px-3.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 shadow-xs transition whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Criar Nova Receita</span>
            </button>
          </div>
        </div>

        {(searchTerm.trim() !== '' || recipes.length > 0) && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 px-0.5">
            <span>
              {searchTerm.trim()
                ? `${filtered.length} ${filtered.length === 1 ? 'receita encontrada' : 'receitas encontradas'} de ${recipes.length}`
                : `${recipes.length} ${recipes.length === 1 ? 'receita salva' : 'receitas salvas'}`}
            </span>
          </div>
        )}
      </div>

      {/* Lista de Receitas */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-10 text-center shadow-xs">
          <Utensils className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">Nenhuma receita encontrada</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm
              ? `Nenhuma receita corresponde a "${searchTerm}". Tente outro termo ou limpe a busca.`
              : 'Seu histórico está vazio. Crie sua primeira receita ou carregue os exemplos da ANVISA.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                Limpar Busca
              </button>
            ) : (
              <button
                type="button"
                onClick={onRestoreSamples}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
              >
                Carregar Receitas de Exemplo
              </button>
            )}
            <button
              type="button"
              onClick={onNewRecipe}
              className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Criar Nova
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item) => {
            const isCurrent = item.id === currentRecipeId;
            const hasGeminiAiIngredient = item.ingredients.some(
              (ing) => ing.source === 'gemini_ai'
            );
            const dateStr = item.updatedAt
              ? new Date(item.updatedAt).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })
              : 'Recente';

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-4.5 transition flex flex-col justify-between shadow-xs ${
                  isCurrent
                    ? 'border-emerald-600 ring-2 ring-emerald-100'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-1">
                      {item.name || 'Sem título'}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {hasGeminiAiIngredient && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                          Estimado por IA – revisar
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          Ativa
                        </span>
                      )}
                    </div>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                      {item.description}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 mb-4">
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md font-medium">
                      Porção: {item.portionSize}
                      {item.isLiquid ? 'ml' : 'g'}
                    </span>
                    <span className="bg-slate-100 px-2 py-0.5 rounded-md">
                      {item.ingredients.length} ingr.
                    </span>
                    {item.category && (
                      <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-700">
                        {item.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span>{dateStr}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onDuplicateRecipe(item)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                      title="Duplicar receita"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteRecipe(item.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Excluir receita"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelectRecipe(item)}
                      className={`py-1.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1 transition cursor-pointer ${
                        hasGeminiAiIngredient
                          ? 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      <span>{hasGeminiAiIngredient ? 'Trocar por item da TACO' : 'Abrir'}</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
