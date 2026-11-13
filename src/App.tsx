/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ChefHat,
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
  Trash2,
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
import { FitToWidth } from './components/FitToWidth';
import { HistoryList } from './components/HistoryList';
import { ExportModal, EXPORT_RESPONSIBILITY_TERM } from './components/ExportModal';
import { AnvisaGuideModal } from './components/AnvisaGuideModal';
import { checkHorizontalOverflow, installDevOverflowListener } from './utils/devOverflowCheck';
import { deleteUser } from 'firebase/auth';
import { auth } from './lib/firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { PWAInstallButton } from './components/PWAInstallButton';
import { AppLogo } from './components/AppLogo';

const STORAGE_KEY = 'rotulofacil_recipes_v1';
const CURRENT_RECIPE_KEY = 'rotulofacil_current_recipe_id';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function EmptyRecipesState({
  onCreateNew,
  onRestoreSamples,
}: {
  onCreateNew: () => void;
  onRestoreSamples: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-6 sm:p-10 text-center shadow-xs space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto">
        <ChefHat className="w-6 h-6" />
      </div>
      <div className="space-y-1.5 max-w-md mx-auto">
        <h2 className="text-base sm:text-lg font-bold text-slate-900">
          Você ainda não tem receitas
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Crie uma nova receita do zero para calcular a tabela nutricional ANVISA ou restaure as receitas de exemplo para testar.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1">
        <button
          type="button"
          onClick={onCreateNew}
          className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Criar nova receita</span>
        </button>
        <button
          type="button"
          onClick={onRestoreSamples}
          className="py-2.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>Restaurar receitas de exemplo</span>
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { user, loading, isVerified } = useAuth();

  useEffect(() => {
    return installDevOverflowListener(() => {
      if (loading) return 'loading';
      if (!user || !isVerified) return 'auth';
      return 'app';
    });
  }, [loading, user, isVerified]);

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
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [currentRecipeId, setCurrentRecipeId] = useState<string | null>(null);
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
  const [recipePendingDelete, setRecipePendingDelete] = useState<Recipe | null>(null);
  const [isDeletingRecipe, setIsDeletingRecipe] = useState(false);
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
        const isFirstAccess = Boolean(
          user?.metadata?.creationTime &&
            user?.metadata?.lastSignInTime &&
            user.metadata.creationTime === user.metadata.lastSignInTime
        );
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

        // Semeia os exemplos iniciais SOMENTE no primeiro acesso da conta e se ainda não migrado
        if (loadedList.length === 0 && !alreadyMigrated && isFirstAccess) {
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
        } else if (!alreadyMigrated && (loadedList.length > 0 || isFirstAccess)) {
          localStorage.setItem(migratedFlagKey, 'true');
        }

        if (!active) return;
        if (loadedList.length > 0) {
          setRecipes(loadedList);
          const savedCurrent = localStorage.getItem(`${CURRENT_RECIPE_KEY}_${uid}`);
          const hasSavedCurrent = savedCurrent && loadedList.some((r) => r.id === savedCurrent);
          setCurrentRecipeId(hasSavedCurrent ? savedCurrent : loadedList[0].id);
        } else {
          setRecipes([]);
          setCurrentRecipeId(null);
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
  }, [user?.uid, user?.metadata?.creationTime, user?.metadata?.lastSignInTime, getToken, showToast, showError]);

  useEffect(() => {
    if (!user?.uid) return;
    try {
      if (currentRecipeId) {
        localStorage.setItem(`${CURRENT_RECIPE_KEY}_${user.uid}`, currentRecipeId);
      } else {
        localStorage.removeItem(`${CURRENT_RECIPE_KEY}_${user.uid}`);
      }
    } catch {}
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

  // Receita atual (null se usuário não tiver receitas)
  const currentRecipe = useMemo<Recipe | null>(() => {
    if (recipes.length === 0) return null;
    return (
      (currentRecipeId ? recipes.find((r) => r.id === currentRecipeId) : undefined) ||
      recipes[0] ||
      null
    );
  }, [recipes, currentRecipeId]);

  // Cálculo nutricional instantâneo e reativo
  const nutrition = useMemo(() => {
    return currentRecipe ? calculateRecipeNutrition(currentRecipe) : null;
  }, [currentRecipe]);

  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      checkHorizontalOverflow(`tab:${activeTab}`);
    });
    return () => cancelAnimationFrame(rafId);
  }, [
    activeTab,
    labelFormat,
    recipes.length,
    currentRecipeId,
    isExportModalOpen,
    isGuideModalOpen,
    isDeleteAccountModalOpen,
    pendingQuickExport,
    recipePendingDelete,
  ]);

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
    if (!currentRecipe) return;
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
        const targetNutrition = calculateRecipeNutrition(recipeToExport);
        exportLabelAsSvg(recipeToExport, targetNutrition, {
          format: labelFormat,
          showIngredients: true,
          showAllergens: true,
        });
      }
    },
    [labelFormat]
  );

  const handleQuickExport = useCallback(
    (kind: 'lupa_svg' | 'lupa_pdf' | 'table_svg') => {
      if (!currentRecipe || !nutrition) return;
      if (!currentRecipe.exportTermsAccepted) {
        setQuickTermChecked(false);
        setPendingQuickExport(kind);
        return;
      }
      executeQuickExport(kind, currentRecipe);
    },
    [currentRecipe, nutrition, executeQuickExport]
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

  const handleDeleteRecipe = (id: string) => {
    const target = recipes.find((r) => r.id === id);
    if (!target) return;
    setRecipePendingDelete(target);
  };

  const confirmDeleteRecipe = async () => {
    if (!recipePendingDelete) return;
    const target = recipePendingDelete;
    const id = target.id;

    if (saveTimersRef.current[id]) {
      clearTimeout(saveTimersRef.current[id]);
      delete saveTimersRef.current[id];
    }

    const previousList = recipes;
    const previousCurrentId = currentRecipeId;
    const nextList = recipes.filter((r) => r.id !== id);
    setRecipes(nextList);
    if (currentRecipeId === id) {
      setCurrentRecipeId(nextList[0]?.id ?? null);
    }
    setRecipePendingDelete(null);

    if (id.startsWith('temp-')) {
      showToast('Receita excluída.');
      return;
    }

    try {
      setIsDeletingRecipe(true);
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
      setRecipes(previousList);
      setCurrentRecipeId(previousCurrentId);
      showError(err?.message || 'Erro ao excluir receita.');
    } finally {
      setIsDeletingRecipe(false);
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
        <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:top-4 sm:right-4 sm:max-w-sm z-50 bg-slate-900 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-3">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="min-w-0 break-words">{saveToast}</span>
        </div>
      )}

      {errorToast && (
        <div className="fixed top-3 inset-x-3 sm:inset-x-auto sm:top-4 sm:right-4 sm:max-w-sm z-50 bg-rose-700 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-rose-500 animate-in fade-in slide-in-from-top-3">
          <AlertTriangle className="w-4 h-4 text-rose-200 shrink-0" />
          <span className="min-w-0 break-words">{errorToast}</span>
        </div>
      )}

      {/* Header Superior Principal */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-4 pt-[max(0.625rem,env(safe-area-inset-top))] pb-2.5 sm:pt-3 sm:pb-3 shadow-2xs">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <AppLogo className="w-8 h-8 sm:w-9 sm:h-9 shrink-0 shadow-xs rounded-[22%]" />
            <div className="min-w-0">
              <div className="flex items-center gap-1 min-w-0">
                <h1 className="text-sm sm:text-lg font-black tracking-tight text-slate-900 leading-none truncate">
                  Rótulo<span className="text-emerald-600">Fácil</span>
                </h1>
                <span className="hidden min-[360px]:inline-block text-[9px] sm:text-[10px] font-black uppercase px-1 sm:px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  ANVISA
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium leading-none mt-0.5 hidden sm:block">
                Padrão RDC 429/2020 & Tabela TACO / UNICAMP
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setIsGuideModalOpen(true)}
              className="py-1.5 px-2 sm:px-3 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Ver Guia de Normas ANVISA"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="hidden sm:inline">Guia ANVISA</span>
              <span className="sm:hidden">Guia</span>
            </button>

            <button
              type="button"
              onClick={handleCreateNewRecipe}
              className="py-1.5 px-2.5 sm:px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Nova Receita</span>
              <span className="sm:hidden">Nova</span>
            </button>

            <div className="hidden md:flex items-center pl-2 border-l border-slate-200 text-xs text-slate-600 max-w-[160px] truncate">
              <span className="truncate font-medium" title={user?.email || ''}>
                {user?.displayName || user?.email}
              </span>
            </div>

            <button
              type="button"
              onClick={logout}
              className="py-1.5 px-2 sm:px-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-rose-700 hover:bg-rose-50 hover:border-rose-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Barra de Navegação em Abas (Desktop / Tablet sm+) */}
        <div className="hidden sm:flex max-w-5xl mx-auto mt-2.5 pt-2 border-t border-slate-100 items-center justify-between gap-2 flex-wrap">
          <nav className="flex flex-wrap gap-1.5">
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
                  className={`py-2 px-3 md:px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
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
          {activeTab === 'label' && currentRecipe && nutrition && (
            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="py-1.5 px-3 rounded-xl bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span>Exportar PNG/PDF</span>
            </button>
          )}
        </div>
      </header>

      {/* Navegação Inferior Fixa para Mobile (< 640px) */}
      <nav
        aria-label="Navegação principal"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1.5 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-[0_-4px_14px_rgba(15,23,42,0.08)]"
      >
        <div className="grid grid-cols-4 gap-1 max-w-md mx-auto">
          {[
            { id: 'recipe', label: 'Receita', icon: ChefHat },
            { id: 'label', label: 'Rótulo', icon: FileText },
            { id: 'analysis', label: 'Análise', icon: PieChart },
            { id: 'history', label: 'Histórico', icon: History, count: recipes.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 rounded-xl text-[10px] font-bold transition min-w-0 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="relative">
                  <Icon className="w-4 h-4" />
                  {tab.count !== undefined && (
                    <span
                      className={`absolute -top-1.5 -right-3 text-[9px] leading-none px-1 py-0.5 rounded-full font-extrabold ${
                        isActive
                          ? 'bg-white text-emerald-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-full">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3 sm:p-6 min-w-0">
        {/* ABA 1: FORMULÁRIO DE RECEITA */}
        {activeTab === 'recipe' &&
          (currentRecipe ? (
            <RecipeForm
              recipe={currentRecipe}
              onChange={handleUpdateRecipe}
              onSaveToHistory={handleSaveToHistory}
              onViewLabel={() => setActiveTab('label')}
            />
          ) : (
            <EmptyRecipesState
              onCreateNew={handleCreateNewRecipe}
              onRestoreSamples={handleRestoreSamples}
            />
          ))}

        {/* ABA 2: VISUALIZAÇÃO E AJUSTE DO RÓTULO */}
        {activeTab === 'label' &&
          (!currentRecipe || !nutrition ? (
            <EmptyRecipesState
              onCreateNew={handleCreateNewRecipe}
              onRestoreSamples={handleRestoreSamples}
            />
          ) : (
            <div className="space-y-5 sm:space-y-6 pb-4 sm:pb-12">
              {/* Controles de Formato e Ações */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-xs space-y-3">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4">
                  <div className="min-w-0 w-full md:w-auto">
                    <h2 className="text-base font-bold text-slate-900">
                      Visualização do Rótulo no Padrão ANVISA
                    </h2>
                    <p className="text-xs text-slate-500 break-words">
                      {currentRecipe.name} • {currentRecipe.portionSize}
                      {currentRecipe.isLiquid ? 'ml' : 'g'} ({currentRecipe.householdMeasure})
                    </p>
                  </div>

                  {/* Seletor de Modelo Visual (grid 2x2 no mobile, inline no desktop) */}
                  <div className="grid grid-cols-2 sm:inline-flex items-stretch gap-1.5 bg-slate-100 p-1 rounded-xl text-xs w-full md:w-auto shrink-0">
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
                          className={`py-1.5 px-2.5 sm:px-3 rounded-lg font-bold transition text-center ${
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
                  <label className="flex items-start sm:items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                    <input
                      type="checkbox"
                      checked={noVerticalSpace}
                      onChange={(e) => handleToggleNoVerticalSpace(e.target.checked)}
                      className="mt-0.5 sm:mt-0 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                    />
                    <span>Não há espaço disponível na embalagem para o modelo vertical</span>
                  </label>
                  <span className="text-[11px] text-slate-500 leading-snug">
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
                  <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900">
                          Painel Frontal — Lupa ANVISA (Anexo XVII)
                        </h3>
                        <p className="text-xs text-slate-500 break-words">
                          Aplicação exclusiva no painel principal (separada da tabela) • Painel {lupaDims.panelAreaCm2} cm² ({lupaDims.label}) → Altura {lupaDims.heightMm} mm
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          disabled={nutrition.glutenResolution.requiresConfirmation}
                          onClick={() => handleQuickExport('lupa_svg')}
                          className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 shrink-0" />
                          <span>Exportar Lupa (SVG)</span>
                        </button>
                        <button
                          type="button"
                          disabled={nutrition.glutenResolution.requiresConfirmation}
                          onClick={() => handleQuickExport('lupa_pdf')}
                          className="flex-1 sm:flex-none py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span>Exportar Lupa (PDF)</span>
                        </button>
                      </div>
                    </div>

                    <div className="p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200/70">
                      <FitToWidth>
                        <FrontalMagnifier
                          warnings={nutrition.frontalWarnings}
                          panelArea={currentRecipe.panelArea}
                        />
                      </FitToWidth>
                    </div>
                  </div>
                );
              })()}

            {/* Alerta bloqueando exportação se glúten não foi confirmado */}
            {nutrition.glutenResolution.requiresConfirmation && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs min-w-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
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
                  className="px-3.5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold shrink-0 text-center cursor-pointer"
                >
                  Confirmar na Receita
                </button>
              </div>
            )}

            {/* Área Central de Renderização da Tabela Nutricional */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-8 shadow-xs flex flex-col items-center justify-center min-h-[260px] sm:min-h-[420px]">
              <FitToWidth>
                <NutritionLabel
                  recipe={currentRecipe}
                  nutrition={nutrition}
                  format={labelFormat}
                  showIngredients={true}
                  showAllergens={true}
                />
              </FitToWidth>
            </div>

            {/* Barra de Ações Rápidas */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs text-slate-500 text-center sm:text-left">
                Tabela gerada estritamente com fonte Arial, bordas sólidas pretas e fundo branco (100% em conformidade com RDC 429/2020).
              </div>

              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('recipe')}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition text-center cursor-pointer"
                >
                  Editar Ingredientes
                </button>
                <button
                  type="button"
                  disabled={nutrition.glutenResolution.requiresConfirmation}
                  onClick={() => handleQuickExport('table_svg')}
                  className="py-2.5 px-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>Tabela SVG</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(true)}
                  className="py-2.5 px-4 sm:px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 text-center shadow-xs transition cursor-pointer"
                >
                  <Download className="w-4 h-4 shrink-0" />
                  <span>Exportar Gráfica (PDF / PNG / SVG)</span>
                </button>
              </div>
            </div>
          </div>
          ))}

        {/* ABA 3: ANÁLISE NUTRICIONAL E LUPA */}
        {activeTab === 'analysis' &&
          (!currentRecipe || !nutrition ? (
            <EmptyRecipesState
              onCreateNew={handleCreateNewRecipe}
              onRestoreSamples={handleRestoreSamples}
            />
          ) : (
            <div className="space-y-5 sm:space-y-6 pb-4 sm:pb-12">
              {/* Visão Geral */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">
                      Análise Nutricional Comparativa
                    </h2>
                    <p className="text-xs text-slate-500">
                      Base: Dieta de 2.000 kcal conforme IN 75/2020 da ANVISA
                    </p>
                  </div>
                  <div className="sm:text-right shrink-0">
                    <span className="inline-block text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                      {nutrition.formattedPerPortion.energyKcal} kcal por porção
                    </span>
                  </div>
                </div>

                {/* Grid de Cards de Nutrientes Principais */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
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
                      className={`p-3 sm:p-3.5 rounded-xl border transition min-w-0 ${
                        item.isAlert
                          ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-300'
                          : 'bg-slate-50 border-slate-200/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-600 uppercase leading-tight min-w-0 break-words">
                          {item.label}
                        </span>
                        {item.isAlert && (
                          <span className="text-[9px] font-black uppercase text-amber-800 bg-amber-200 px-1.5 py-0.5 rounded shrink-0">
                            Lupa
                          </span>
                        )}
                      </div>
                      <div className="text-base sm:text-lg font-black text-slate-900 mt-1">
                        {item.perPortion}{' '}
                        <span className="text-xs font-semibold text-slate-500">{item.unit}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
                        <span>
                          Por 100g: {item.per100g}
                          {item.unit}
                        </span>
                        {item.vd !== null && (
                          <span className="font-bold text-emerald-700">{item.vd}% VD</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Diagnóstico da Lupa Frontal */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs">
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
          ))}

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
      <footer className="border-t border-slate-200/80 bg-white/80 px-3 sm:px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="text-center sm:text-left min-w-0">
            <span className="font-semibold text-slate-800">Privacidade e Dados (LGPD):</span>{' '}
            <span>Suas receitas são criptografadas com isolamento por usuário.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isExportingAccountData}
              onClick={handleExportMyData}
              className="py-1.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
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
      {currentRecipe && nutrition && (
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
      )}

      {/* Modal de Termo de Responsabilidade para Exportação Rápida */}
      {pendingQuickExport && currentRecipe && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-4 sm:p-5 space-y-4 max-h-[calc(100vh-24px)] overflow-y-auto">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900">
                Termo de Responsabilidade
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 break-words">
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
                className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
              />
              <span>Li e estou ciente do termo acima para esta receita.</span>
            </label>
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
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

      {/* Modal de Confirmação de Exclusão de Receita */}
      {recipePendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-200 p-4 sm:p-5 space-y-4 max-h-[calc(100vh-24px)] overflow-y-auto">
            <div className="flex items-start gap-2.5">
              <Trash2 className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">
                  Excluir receita
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
                  Excluir a receita &apos;{recipePendingDelete.name || 'Sem título'}&apos;? Essa ação não pode ser desfeita.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={isDeletingRecipe}
                onClick={() => setRecipePendingDelete(null)}
                className="py-2 px-3.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isDeletingRecipe}
                onClick={confirmDeleteRecipe}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold transition cursor-pointer"
              >
                {isDeletingRecipe ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Conta (LGPD) */}
      {isDeleteAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-rose-200 p-4 sm:p-5 space-y-4 max-h-[calc(100vh-24px)] overflow-y-auto">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
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

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
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
