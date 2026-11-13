/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ChefHat,
  Scale,
  FileText,
  History,
  Download,
  Plus,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  PieChart,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { Recipe, LabelFormat } from './types/nutrition';
import { SAMPLE_RECIPES } from './data/sampleRecipes';
import { calculateRecipeNutrition } from './utils/nutritionCalculator';
import {
  ANVISA_TABLE_FORMAT_CONDITIONS_WARNING,
  getFrontalMagnifierDimensions,
} from './utils/anvisaRules';
import { exportLupaAsPdf, exportLupaAsSvg } from './utils/exportLupa';
import { exportLabelAsSvg } from './utils/exportLabel';
import { RecipeForm } from './components/RecipeForm';
import { NutritionLabel } from './components/NutritionLabel';
import { FrontalMagnifier } from './components/FrontalMagnifier';
import { HistoryList } from './components/HistoryList';
import { ExportModal, EXPORT_RESPONSIBILITY_TERM } from './components/ExportModal';
import { AnvisaGuideModal } from './components/AnvisaGuideModal';
import { deleteUser } from 'firebase/auth';
import { auth } from './lib/firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';

const STORAGE_KEY = 'rotulofacil_recipes_v1';
const CURRENT_RECIPE_KEY = 'rotulofacil_current_recipe_id';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { user, loading, isVerified } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100/80 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs mb-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-slate-600">Carregando sua conta...</p>
      </div>
    );
  }

  if (!user || !isVerified) {
    return <AuthScreen />;
  }

  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const { user, getToken, logout } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>(SAMPLE_RECIPES);
  const [currentRecipeId, setCurrentRecipeId] = useState<string>(SAMPLE_RECIPES[0].id);
  const [loadingRecipes, setLoadingRecipes] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'recipe' | 'label' | 'analysis' | 'history'>('recipe');
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('vertical');
  const [noVerticalSpace, setNoVerticalSpace] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [pendingQuickExport, setPendingQuickExport] = useState<
    'lupa_svg' | 'lupa_pdf' | 'table_svg' | null
  >(null);
  const [quickTermChecked, setQuickTermChecked] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isExportingAccountData, setIsExportingAccountData] = useState(false);
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const saveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const showToast = useCallback((msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3200);
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 4000);
  }, []);

  const handleToggleNoVerticalSpace = useCallback(
    (next: boolean) => {
      setNoVerticalSpace(next);
      if (!next && (labelFormat === 'horizontal' || labelFormat === 'linear')) {
        setLabelFormat('vertical');
      }
    },
    [labelFormat]
  );

  // Carrega receitas do usuário autenticado e transfere receitas locais se existirem
  useEffect(() => {
    let active = true;
    const uid = user?.uid;
    if (!uid) return;

    async function loadAndMigrate() {
      setLoadingRecipes(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/recipes', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Não foi possível carregar suas receitas.');
        }

        let loadedList: Recipe[] = Array.isArray(data.recipes) ? data.recipes : [];

        // Verifica se há receitas salvas localmente para transferir para esta conta
        const migratedFlagKey = `rotulofacil_migrated_${uid}`;
        const alreadyMigrated = localStorage.getItem(migratedFlagKey) === 'true';
        const rawLocal = localStorage.getItem(STORAGE_KEY);

        if (!alreadyMigrated && rawLocal) {
          try {
            const parsedLocal = JSON.parse(rawLocal);
            if (Array.isArray(parsedLocal) && parsedLocal.length > 0) {
              const migRes = await fetch('/api/recipes/migrate', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ recipes: parsedLocal }),
              });
              const migData = await migRes.json().catch(() => ({}));
              if (migRes.ok && Array.isArray(migData.recipes)) {
                loadedList = migData.recipes;
                localStorage.setItem(migratedFlagKey, 'true');
                showToast('Suas receitas anteriores foram transferidas para sua conta!');
              }
            }
          } catch (e) {
            console.error('Erro ao ler receitas locais para migração:', e);
          }
        }

        // Se a conta ainda não tiver nenhuma receita, semeia os 3 exemplos iniciais para o usuário
        if (loadedList.length === 0) {
          const seedRes = await fetch('/api/recipes/migrate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ recipes: SAMPLE_RECIPES }),
          });
          const seedData = await seedRes.json().catch(() => ({}));
          if (seedRes.ok && Array.isArray(seedData.recipes)) {
            loadedList = seedData.recipes;
            localStorage.setItem(migratedFlagKey, 'true');
          }
        }

        if (!active) return;
        if (loadedList.length > 0) {
          setRecipes(loadedList);
          const savedCurrent = localStorage.getItem(`${CURRENT_RECIPE_KEY}_${uid}`);
          const hasSavedCurrent = savedCurrent && loadedList.some((r) => r.id === savedCurrent);
          setCurrentRecipeId(hasSavedCurrent ? savedCurrent : loadedList[0].id);
        }
      } catch (err: any) {
        if (active) {
          showError(err?.message || 'Erro ao carregar suas receitas.');
        }
      } finally {
        if (active) setLoadingRecipes(false);
      }
    }

    loadAndMigrate();

    return () => {
      active = false;
      Object.values(saveTimersRef.current).forEach(clearTimeout);
    };
  }, [user?.uid, getToken, showToast, showError]);

  useEffect(() => {
    if (user?.uid && currentRecipeId) {
      try {
        localStorage.setItem(`${CURRENT_RECIPE_KEY}_${user.uid}`, currentRecipeId);
      } catch {}
    }
  }, [user?.uid, currentRecipeId]);

  const persistRecipeToServer = useCallback(
    async (recipeToSave: Recipe, silent = true) => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`/api/recipes/${encodeURIComponent(recipeToSave.id)}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(recipeToSave),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao salvar receita.');
        }
        if (!silent) {
          showToast(`Receita "${recipeToSave.name}" salva com sucesso!`);
        }
      } catch (err: any) {
        showError(err?.message || 'Não foi possível salvar a alteração.');
      }
    },
    [getToken, showToast, showError]
  );

  const createRecipeOnServer = useCallback(
    async (draftRecipe: Recipe, tempId: string) => {
      try {
        const token = await getToken();
        if (!token) return;
        const { id: _ignoredId, ...payload } = draftRecipe;
        const res = await fetch('/api/recipes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.recipe?.id) {
          throw new Error(data.error || 'Erro ao criar receita.');
        }

        const serverRecipe = data.recipe as Recipe;
        if (saveTimersRef.current[tempId]) {
          clearTimeout(saveTimersRef.current[tempId]);
          delete saveTimersRef.current[tempId];
        }

        setRecipes((prev) =>
          prev.map((r) =>
            r.id === tempId
              ? {
                  ...r,
                  id: serverRecipe.id,
                  createdAt: serverRecipe.createdAt,
                  updatedAt: serverRecipe.updatedAt,
                }
              : r
          )
        );
        setCurrentRecipeId((curr) => (curr === tempId ? serverRecipe.id : curr));
      } catch (err: any) {
        showError(err?.message || 'Não foi possível criar a receita.');
      }
    },
    [getToken, showError]
  );

  // Receita atual
  const currentRecipe = useMemo(() => {
    return recipes.find((r) => r.id === currentRecipeId) || recipes[0] || SAMPLE_RECIPES[0];
  }, [recipes, currentRecipeId]);

  // Cálculo nutricional instantâneo e reativo
  const nutrition = useMemo(() => {
    return calculateRecipeNutrition(currentRecipe);
  }, [currentRecipe]);

  const handleUpdateRecipe = (updated: Recipe) => {
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (updated.id.startsWith('temp-')) {
      return;
    }
    if (saveTimersRef.current[updated.id]) {
      clearTimeout(saveTimersRef.current[updated.id]);
    }
    saveTimersRef.current[updated.id] = setTimeout(() => {
      persistRecipeToServer(updated, true);
    }, 600);
  };

  const handleSaveToHistory = () => {
    const updated = { ...currentRecipe, updatedAt: new Date().toISOString() };
    setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (updated.id.startsWith('temp-')) {
      return;
    }
    if (saveTimersRef.current[updated.id]) {
      clearTimeout(saveTimersRef.current[updated.id]);
    }
    persistRecipeToServer(updated, false);
  };

  const handleAcceptExportTerms = useCallback(
    (targetRecipe: Recipe) => {
      const updated: Recipe = {
        ...targetRecipe,
        exportTermsAccepted: true,
        exportTermsAcceptedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setRecipes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      if (!updated.id.startsWith('temp-')) {
        if (saveTimersRef.current[updated.id]) {
          clearTimeout(saveTimersRef.current[updated.id]);
          delete saveTimersRef.current[updated.id];
        }
        persistRecipeToServer(updated, true);
      }
      return updated;
    },
    [persistRecipeToServer]
  );

  const executeQuickExport = useCallback(
    (kind: 'lupa_svg' | 'lupa_pdf' | 'table_svg', recipeToExport: Recipe) => {
      if (kind === 'lupa_svg') {
        exportLupaAsSvg(recipeToExport);
      } else if (kind === 'lupa_pdf') {
        exportLupaAsPdf(recipeToExport);
      } else {
        exportLabelAsSvg(recipeToExport, nutrition, {
          format: labelFormat,
          showIngredients: true,
          showAllergens: true,
        });
      }
    },
    [nutrition, labelFormat]
  );

  const handleQuickExport = useCallback(
    (kind: 'lupa_svg' | 'lupa_pdf' | 'table_svg') => {
      if (!currentRecipe.exportTermsAccepted) {
        setQuickTermChecked(false);
        setPendingQuickExport(kind);
        return;
      }
      executeQuickExport(kind, currentRecipe);
    },
    [currentRecipe, executeQuickExport]
  );

  const handleCreateNewRecipe = async () => {
    const tempId = `temp-${Date.now()}`;
    const newRecipe: Recipe = {
      id: tempId,
      name: 'Nova Receita Sem Título',
      category: 'Geral',
      isLiquid: false,
      density: 1,
      panelArea: 150,
      productCategory: 'geral',
      hasAddedCriticalIngredients: false,
      portionSize: 50,
      householdMeasure: '1 porção (50 g)',
      servingsPerPackage: 'cerca de 5 porções',
      ingredients: [],
      declaredAllergens: [],
      mayContainAllergens: [],
      containsGluten: false,
      glutenStatus: 'unconfirmed',
      containsLactose: false,
      exportTermsAccepted: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRecipes((prev) => [newRecipe, ...prev]);
    setCurrentRecipeId(tempId);
    setActiveTab('recipe');
    await createRecipeOnServer(newRecipe, tempId);
  };

  const handleDuplicateRecipe = async (recipeToDup: Recipe) => {
    const tempId = `temp-${Date.now()}`;
    const dup: Recipe = {
      ...recipeToDup,
      id: tempId,
      name: `${recipeToDup.name} (Cópia)`,
      exportTermsAccepted: false,
      exportTermsAcceptedAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setRecipes((prev) => [dup, ...prev]);
    setCurrentRecipeId(tempId);
    setActiveTab('recipe');
    await createRecipeOnServer(dup, tempId);
    showToast('Cópia criada com sucesso!');
  };

  const handleDeleteRecipe = async (id: string) => {
    if (recipes.length <= 1) {
      showError('Você precisa manter pelo menos uma receita salva.');
      return;
    }
    const nextList = recipes.filter((r) => r.id !== id);
    setRecipes(nextList);
    if (currentRecipeId === id) {
      setCurrentRecipeId(nextList[0].id);
    }

    if (id.startsWith('temp-')) {
      showToast('Receita excluída.');
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/recipes/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha ao excluir receita.');
      }
      showToast('Receita excluída.');
    } catch (err: any) {
      showError(err?.message || 'Erro ao excluir receita.');
    }
  };

  const handleRestoreSamples = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/recipes/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipes: SAMPLE_RECIPES }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.recipes) && data.recipes.length > 0) {
        setRecipes(data.recipes);
        setCurrentRecipeId(data.recipes[0].id);
        setActiveTab('recipe');
        showToast('Receitas de exemplo adicionadas à sua conta!');
      }
    } catch (err: any) {
      showError(err?.message || 'Erro ao restaurar exemplos.');
    }
  };

  const handleExportMyData = async () => {
    try {
      setIsExportingAccountData(true);
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/account/export', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao exportar seus dados.');
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'rotulofacil-meus-dados.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Dados exportados com sucesso!');
    } catch (err: any) {
      showError(err?.message || 'Não foi possível exportar seus dados.');
    } finally {
      setIsExportingAccountData(false);
    }
  };

  const handleDeleteMyAccount = async () => {
    if (deleteAccountConfirmText.trim() !== 'EXCLUIR') return;
    try {
      setIsDeletingAccount(true);
      const token = await getToken(true);
      if (!token) return;
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível excluir sua conta.');
      }
      if (data.deleteAuthOnClient && auth.currentUser) {
        try {
          await deleteUser(auth.currentUser);
        } catch (authErr: any) {
          if (authErr?.code === 'auth/requires-recent-login') {
            setIsDeleteAccountModalOpen(false);
            setDeleteAccountConfirmText('');
            showError('Por segurança, entre novamente para concluir a exclusão');
            return;
          }
          throw authErr;
        }
      }
      if (user?.uid) {
        try {
          localStorage.removeItem(`rotulofacil_migrated_${user.uid}`);
          localStorage.removeItem(`${CURRENT_RECIPE_KEY}_${user.uid}`);
        } catch {}
      }
      setIsDeleteAccountModalOpen(false);
      setDeleteAccountConfirmText('');
      await logout();
    } catch (err: any) {
      showError(err?.message || 'Erro ao excluir conta.');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  if (loadingRecipes) {
    return (
      <div className="min-h-screen bg-slate-100/70 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs mb-3">
          <RefreshCw className="w-5 h-5 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-slate-600">Sincronizando suas receitas...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Toast Notification */}
      {saveToast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-3">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{saveToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-4 right-4 z-50 bg-rose-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-rose-500 animate-in fade-in slide-in-from-top-3">
          <AlertTriangle className="w-4 h-4 text-rose-200" />
          <span>{errorToast}</span>
        </div>
      )}

      {/* Header Superior Principal */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 py-3 shadow-2xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Scale className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 leading-none">
                  Rótulo<span className="text-emerald-600">Fácil</span>
                </h1>
                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                  ANVISA
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-0.5 hidden xs:block">
                Padrão RDC 429/2020 & Tabela TACO / UNICAMP
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="py-1.5 px-3 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              title="Ver Guia de Normas ANVISA"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">Guia</span> ANVISA
            </button>

            <button
              type="button"
              onClick={handleCreateNewRecipe}
              className="py-1.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Nova</span> Receita
            </button>

            <div className="hidden md:flex items-center pl-2 border-l border-slate-200 text-xs text-slate-600 max-w-[160px] truncate">
              <span className="truncate font-medium" title={user?.email || ''}>
                {user?.displayName || user?.email}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              className="py-1.5 px-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Sair da conta"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Barra de Navegação em Abas (Mobile & Desktop) */}
        <div className="max-w-5xl mx-auto mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between gap-1 overflow-x-auto">
          <nav className="flex space-x-1 sm:space-x-2">
            {[
              { id: 'recipe', label: '1. Receita & TACO', icon: ChefHat },
              { id: 'label', label: '2. Tabela & Rótulo', icon: FileText },
              { id: 'analysis', label: '3. Análise & Lupa', icon: PieChart },
              { id: 'history', label: 'Histórico', icon: History, count: recipes.length },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-2 px-3 sm:px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Botão de Exportar Rápido no Topo */}
          {activeTab === 'label' && (
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Exportar PNG/PDF</span>
            </button>
          )}
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6">
        {/* ABA 1: FORMULÁRIO DE RECEITA */}
        {activeTab === 'recipe' && (
          <RecipeForm
            recipe={currentRecipe}
            onChange={handleUpdateRecipe}
            onSaveToHistory={handleSaveToHistory}
            onViewLabel={() => setActiveTab('label')}
          />
        )}

        {/* ABA 2: VISUALIZAÇÃO E AJUSTE DO RÓTULO */}
        {activeTab === 'label' && (
          <div className="space-y-6 pb-12">
            {/* Controles de Formato e Ações */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Visualização do Rótulo no Padrão ANVISA
                  </h2>
                  <p className="text-xs text-slate-500">
                    {currentRecipe.name} • {currentRecipe.portionSize}
                    {currentRecipe.isLiquid ? 'ml' : 'g'} ({currentRecipe.householdMeasure})
                  </p>
                </div>

                {/* Seletor de Modelo Visual */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs w-full md:w-auto overflow-x-auto">
                  {[
                    { id: 'vertical', label: 'Vertical', compactOnly: false },
                    { id: 'vertical_broken', label: 'Quebrado', compactOnly: false },
                    { id: 'horizontal', label: 'Horizontal', compactOnly: true },
                    { id: 'linear', label: 'Linear', compactOnly: true },
                  ].map((fmt) => {
                    const isDisabled = fmt.compactOnly && !noVerticalSpace;
                    return (
                      <button
                        key={fmt.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setLabelFormat(fmt.id as LabelFormat)}
                        title={
                          isDisabled
                            ? 'Disponível somente quando não houver espaço para a tabela vertical (IN 75/2020).'
                            : undefined
                        }
                        className={`py-1.5 px-3 rounded-lg font-bold transition whitespace-nowrap ${
                          labelFormat === fmt.id
                            ? 'bg-white text-slate-900 shadow-xs cursor-pointer'
                            : isDisabled
                              ? 'text-slate-400 cursor-not-allowed'
                              : 'text-slate-600 hover:text-slate-900 cursor-pointer'
                        }`}
                      >
                        {fmt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                  <input
                    type="checkbox"
                    checked={noVerticalSpace}
                    onChange={(e) => handleToggleNoVerticalSpace(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Não há espaço disponível na embalagem para o modelo vertical</span>
                </label>
                <span className="text-[11px] text-slate-500">
                  {ANVISA_TABLE_FORMAT_CONDITIONS_WARNING}
                </span>
              </div>
            </div>

            {/* Aviso de Isenção do Anexo XVI */}
            {nutrition.frontalExemption.isExempt && nutrition.frontalExemption.reason && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold text-sm text-emerald-900">
                    Produto Isento de Rotulagem Nutricional Frontal (Lupa ANVISA)
                  </div>
                  <p className="mt-1 leading-relaxed">{nutrition.frontalExemption.reason}</p>
                </div>
              </div>
            )}

            {/* Alerta de Lupa Frontal se ultrapassar limites e não for isento */}
            {!nutrition.frontalExemption.isExempt &&
              (nutrition.frontalWarnings.highAddedSugar ||
                nutrition.frontalWarnings.highSaturatedFat ||
                nutrition.frontalWarnings.highSodium) && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 text-amber-950 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-bold text-sm text-amber-900">
                      Atenção aos limites da Rotulagem Frontal (Lupa ANVISA)
                    </div>
                    <p className="mt-1 leading-relaxed">
                      Este produto atingiu o critério de <strong>ALTO EM</strong> segundo a RDC 429/2020:
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {nutrition.frontalWarnings.highAddedSugar && (
                        <span className="bg-amber-200/80 px-2.5 py-1 rounded-lg font-bold text-amber-900">
                          Açúcar Adicionado (≥ {currentRecipe.isLiquid ? '7,5g/100ml' : '15g/100g'})
                        </span>
                      )}
                      {nutrition.frontalWarnings.highSaturatedFat && (
                        <span className="bg-amber-200/80 px-2.5 py-1 rounded-lg font-bold text-amber-900">
                          Gordura Saturada (≥ {currentRecipe.isLiquid ? '3g/100ml' : '6g/100g'})
                        </span>
                      )}
                      {nutrition.frontalWarnings.highSodium && (
                        <span className="bg-amber-200/80 px-2.5 py-1 rounded-lg font-bold text-amber-900">
                          Sódio (≥ {currentRecipe.isLiquid ? '300mg/100ml' : '600mg/100g'})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

            {/* Painel Frontal separado da Tabela Nutricional */}
            {!nutrition.frontalExemption.isExempt &&
              (nutrition.frontalWarnings.highAddedSugar ||
                nutrition.frontalWarnings.highSaturatedFat ||
                nutrition.frontalWarnings.highSodium) && (() => {
                const lupaDims = getFrontalMagnifierDimensions(currentRecipe.panelArea);
                return (
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">
                          Painel Frontal — Lupa ANVISA (Anexo XVII)
                        </h3>
                        <p className="text-xs text-slate-500">
                          Aplicação exclusiva no painel principal (separada da tabela) • Painel {lupaDims.panelAreaCm2} cm² ({lupaDims.label}) → Altura {lupaDims.heightMm} mm
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={nutrition.glutenResolution.requiresConfirmation}
                          onClick={() => handleQuickExport('lupa_svg')}
                          className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Exportar Lupa (SVG)</span>
                        </button>
                        <button
                          type="button"
                          disabled={nutrition.glutenResolution.requiresConfirmation}
                          onClick={() => handleQuickExport('lupa_pdf')}
                          className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Exportar Lupa (PDF)</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-center overflow-x-auto">
                      <FrontalMagnifier
                        warnings={nutrition.frontalWarnings}
                        panelArea={currentRecipe.panelArea}
                      />
                    </div>
                  </div>
                );
              })()}

            {/* Alerta bloqueando exportação se glúten não foi confirmado */}
            {nutrition.glutenResolution.requiresConfirmation && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-rose-900">
                      Confirmação de Glúten Obrigatória (Exportação Bloqueada)
                    </div>
                    <p className="mt-0.5 leading-relaxed">
                      Esta receita não possui cereais com glúten listados, mas nunca declaramos &quot;NÃO CONTÉM GLÚTEN&quot; automaticamente. Confirme explicitamente na aba Receita se há ou não risco de contaminação cruzada.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('recipe')}
                  className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                >
                  Confirmar na Receita
                </button>
              </div>
            )}

            {/* Área Central de Renderização da Tabela Nutricional */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-10 shadow-xs flex flex-col items-center justify-center overflow-x-auto min-h-[420px]">
              <div className="scale-100 sm:scale-105 transition-transform duration-200">
                <NutritionLabel
                  recipe={currentRecipe}
                  nutrition={nutrition}
                  format={labelFormat}
                  showIngredients={true}
                  showAllergens={true}
                />
              </div>
            </div>

            {/* Barra de Ações Rápidas */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs text-slate-500 text-center sm:text-left">
                Tabela gerada estritamente com fonte Arial, bordas sólidas pretas e fundo branco (100% em conformidade com RDC 429/2020).
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('recipe')}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition"
                >
                  Editar Ingredientes
                </button>
                <button
                  type="button"
                  disabled={nutrition.glutenResolution.requiresConfirmation}
                  onClick={() => handleQuickExport('table_svg')}
                  className="flex-1 sm:flex-none py-2.5 px-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tabela SVG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="flex-1 sm:flex-none py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Exportar Gráfica (PDF / PNG / SVG)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ABA 3: ANÁLISE NUTRICIONAL E LUPA */}
        {activeTab === 'analysis' && (
          <div className="space-y-6 pb-12">
            {/* Visão Geral */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Análise Nutricional Comparativa
                  </h2>
                  <p className="text-xs text-slate-500">
                    Base: Dieta de 2.000 kcal conforme IN 75/2020 da ANVISA
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    {nutrition.formattedPerPortion.energyKcal} kcal por porção
                  </span>
                </div>
              </div>

              {/* Grid de Cards de Nutrientes Principais */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  {
                    label: 'Calorias (kcal)',
                    perPortion: nutrition.formattedPerPortion.energyKcal,
                    per100g: nutrition.formattedPer100g.energyKcal,
                    vd: nutrition.percentDailyValue.energyKcal,
                    unit: 'kcal',
                  },
                  {
                    label: 'Carboidratos',
                    perPortion: nutrition.formattedPerPortion.carbohydrates,
                    per100g: nutrition.formattedPer100g.carbohydrates,
                    vd: nutrition.percentDailyValue.carbohydrates,
                    unit: 'g',
                  },
                  {
                    label: 'Açúcares Adicionados',
                    perPortion: nutrition.formattedPerPortion.addedSugars,
                    per100g: nutrition.formattedPer100g.addedSugars,
                    vd: nutrition.percentDailyValue.addedSugars,
                    unit: 'g',
                    isAlert: nutrition.frontalWarnings.highAddedSugar,
                  },
                  {
                    label: 'Proteínas',
                    perPortion: nutrition.formattedPerPortion.proteins,
                    per100g: nutrition.formattedPer100g.proteins,
                    vd: nutrition.percentDailyValue.proteins,
                    unit: 'g',
                  },
                  {
                    label: 'Gorduras Totais',
                    perPortion: nutrition.formattedPerPortion.totalFat,
                    per100g: nutrition.formattedPer100g.totalFat,
                    vd: nutrition.percentDailyValue.totalFat,
                    unit: 'g',
                  },
                  {
                    label: 'Gorduras Saturadas',
                    perPortion: nutrition.formattedPerPortion.saturatedFat,
                    per100g: nutrition.formattedPer100g.saturatedFat,
                    vd: nutrition.percentDailyValue.saturatedFat,
                    unit: 'g',
                    isAlert: nutrition.frontalWarnings.highSaturatedFat,
                  },
                  {
                    label: 'Fibra Alimentar',
                    perPortion: nutrition.formattedPerPortion.dietaryFiber,
                    per100g: nutrition.formattedPer100g.dietaryFiber,
                    vd: nutrition.percentDailyValue.dietaryFiber,
                    unit: 'g',
                  },
                  {
                    label: 'Sódio',
                    perPortion: nutrition.formattedPerPortion.sodium,
                    per100g: nutrition.formattedPer100g.sodium,
                    vd: nutrition.percentDailyValue.sodium,
                    unit: 'mg',
                    isAlert: nutrition.frontalWarnings.highSodium,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`p-3.5 rounded-xl border transition ${
                      item.isAlert
                        ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-600 uppercase">
                        {item.label}
                      </span>
                      {item.isAlert && (
                        <span className="text-[9px] font-black uppercase text-amber-800 bg-amber-200 px-1.5 py-0.2 rounded">
                          Lupa
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-black text-slate-900 mt-1">
                      {item.perPortion}{' '}
                      <span className="text-xs font-semibold text-slate-500">{item.unit}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
                      <span>Por 100g: {item.per100g}{item.unit}</span>
                      {item.vd !== null && (
                        <span className="font-bold text-emerald-700">{item.vd}% VD</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Diagnóstico da Lupa Frontal */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                <span>Diagnóstico de Rotulagem Frontal (Lupa ANVISA)</span>
              </h3>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                A rotulagem nutricional frontal visa esclarecer o consumidor, de forma clara e simples, sobre o alto conteúdo de nutrientes que têm relevância para a saúde pública.
              </p>

              {nutrition.frontalExemption.isExempt && nutrition.frontalExemption.reason && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Isento de Lupa Frontal:</span>{' '}
                    {nutrition.frontalExemption.reason}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Açúcar Adicionado */}
                <div
                  className={`p-3.5 rounded-xl border text-xs ${
                    nutrition.frontalWarnings.highAddedSugar
                      ? 'bg-rose-50/60 border-rose-300 text-rose-950'
                      : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="font-bold uppercase tracking-wide">Açúcar Adicionado</div>
                  <div className="text-sm font-black mt-1">
                    {nutrition.formattedPer100g.addedSugars} g / 100{currentRecipe.isLiquid ? 'ml' : 'g'}
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    Limite: ≥ {currentRecipe.isLiquid ? '7,5' : '15'} g/100{currentRecipe.isLiquid ? 'ml' : 'g'}
                  </div>
                  <div className="mt-2 text-[10px] font-bold">
                    {nutrition.frontalWarnings.highAddedSugar ? (
                      <span className="text-rose-700">⚠️ Requer Lupa Frontal</span>
                    ) : (
                      <span className="text-emerald-700">✓ Dentro do limite (Sem lupa)</span>
                    )}
                  </div>
                </div>

                {/* Gordura Saturada */}
                <div
                  className={`p-3.5 rounded-xl border text-xs ${
                    nutrition.frontalWarnings.highSaturatedFat
                      ? 'bg-rose-50/60 border-rose-300 text-rose-950'
                      : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="font-bold uppercase tracking-wide">Gordura Saturada</div>
                  <div className="text-sm font-black mt-1">
                    {nutrition.formattedPer100g.saturatedFat} g / 100{currentRecipe.isLiquid ? 'ml' : 'g'}
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    Limite: ≥ {currentRecipe.isLiquid ? '3' : '6'} g/100{currentRecipe.isLiquid ? 'ml' : 'g'}
                  </div>
                  <div className="mt-2 text-[10px] font-bold">
                    {nutrition.frontalWarnings.highSaturatedFat ? (
                      <span className="text-rose-700">⚠️ Requer Lupa Frontal</span>
                    ) : (
                      <span className="text-emerald-700">✓ Dentro do limite (Sem lupa)</span>
                    )}
                  </div>
                </div>

                {/* Sódio */}
                <div
                  className={`p-3.5 rounded-xl border text-xs ${
                    nutrition.frontalWarnings.highSodium
                      ? 'bg-rose-50/60 border-rose-300 text-rose-950'
                      : 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                  }`}
                >
                  <div className="font-bold uppercase tracking-wide">Sódio</div>
                  <div className="text-sm font-black mt-1">
                    {nutrition.formattedPer100g.sodium} mg / 100{currentRecipe.isLiquid ? 'ml' : 'g'}
                  </div>
                  <div className="text-[11px] mt-1 text-slate-600">
                    Limite: ≥ {currentRecipe.isLiquid ? '300' : '600'} mg/100{currentRecipe.isLiquid ? 'ml' : 'g'}
                  </div>
                  <div className="mt-2 text-[10px] font-bold">
                    {nutrition.frontalWarnings.highSodium ? (
                      <span className="text-rose-700">⚠️ Requer Lupa Frontal</span>
                    ) : (
                      <span className="text-emerald-700">✓ Dentro do limite (Sem lupa)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 4: HISTÓRICO DE RECEITAS */}
        {activeTab === 'history' && (
          <HistoryList
            recipes={recipes}
            currentRecipeId={currentRecipeId}
            onSelectRecipe={(r) => {
              setCurrentRecipeId(r.id);
              setActiveTab('recipe');
            }}
            onDuplicateRecipe={handleDuplicateRecipe}
            onDeleteRecipe={handleDeleteRecipe}
            onNewRecipe={handleCreateNewRecipe}
            onRestoreSamples={handleRestoreSamples}
          />
        )}
      </main>

      {/* Rodapé de Privacidade e Direitos LGPD */}
      <footer className="border-t border-slate-200/80 bg-white/80 px-4 py-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="text-center sm:text-left">
            <span className="font-semibold text-slate-800">Privacidade e Dados (LGPD):</span>{' '}
            <span>Suas receitas são criptografadas com isolamento por usuário.</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isExportingAccountData}
              onClick={handleExportMyData}
              className="py-1.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExportingAccountData ? 'Exportando...' : 'Exportar meus dados'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDeleteAccountConfirmText('');
                setIsDeleteAccountModalOpen(true);
              }}
              className="py-1.5 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold transition cursor-pointer"
            >
              Excluir minha conta
            </button>
          </div>
        </div>
      </footer>

      {/* Modal de Exportação */}
      <ExportModal
        recipe={currentRecipe}
        nutrition={nutrition}
        format={labelFormat}
        onChangeFormat={setLabelFormat}
        noVerticalSpace={noVerticalSpace}
        onChangeNoVerticalSpace={handleToggleNoVerticalSpace}
        onAcceptExportTerms={() => handleAcceptExportTerms(currentRecipe)}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      />

      {/* Modal de Termo de Responsabilidade para Exportação Rápida */}
      {pendingQuickExport && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Termo de Responsabilidade
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Receita: {currentRecipe.name || 'Sem título'}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs leading-relaxed">
              {EXPORT_RESPONSIBILITY_TERM}
            </div>
            <label className="flex items-start gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={quickTermChecked}
                onChange={(e) => setQuickTermChecked(e.target.checked)}
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Li e estou ciente do termo acima para esta receita.</span>
            </label>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setPendingQuickExport(null)}
                className="py-2 px-3.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!quickTermChecked}
                onClick={() => {
                  const kind = pendingQuickExport;
                  const updated = handleAcceptExportTerms(currentRecipe);
                  setPendingQuickExport(null);
                  setQuickTermChecked(false);
                  executeQuickExport(kind, updated);
                }}
                className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition cursor-pointer"
              >
                Aceitar e Exportar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Conta (LGPD) */}
      {isDeleteAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-200 p-5 space-y-4">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Excluir minha conta
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Esta ação é irreversível. Todas as suas receitas salvas e sua conta de acesso serão apagadas permanentemente.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="confirm-delete-account-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Para confirmar, digite <strong>EXCLUIR</strong> abaixo:
              </label>
              <input
                id="confirm-delete-account-input"
                type="text"
                value={deleteAccountConfirmText}
                onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                placeholder="EXCLUIR"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:border-rose-600 focus:ring-2 focus:ring-rose-100 outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={isDeletingAccount}
                onClick={() => {
                  setIsDeleteAccountModalOpen(false);
                  setDeleteAccountConfirmText('');
                }}
                className="py-2 px-3.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteAccountConfirmText.trim() !== 'EXCLUIR' || isDeletingAccount}
                onClick={handleDeleteMyAccount}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition cursor-pointer"
              >
                {isDeletingAccount ? 'Excluindo...' : 'Confirmar exclusão'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal do Guia ANVISA */}
      <AnvisaGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  );
}
