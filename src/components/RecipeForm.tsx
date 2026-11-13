/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Sparkles,
  Check,
  AlertCircle,
  AlertTriangle,
  Scale,
  ChefHat,
  Bookmark,
  RefreshCw,
  FileEdit,
  ArrowLeftRight,
  X,
  Droplets,
} from 'lucide-react';
import {
  AllergenId,
  AllergenPresence,
  FrontalProductCategory,
  Ingredient,
  IngredientAllergenDeclaration,
  Recipe,
  TacoSearchItem,
} from '../types/nutrition';
import {
  ANVISA_PRODUCT_CATEGORIES,
  evaluateFrontalExemption,
  getFrontalMagnifierDimensions,
} from '../utils/anvisaRules';
import {
  RDC_727_ALLERGENS,
  buildAllergenStatements,
  buildIngredientsListText,
  getAllergenDef,
  getEffectiveIngredientAllergens,
  resolveGlutenStatus,
  suggestAllergensFromIngredientName,
} from '../utils/allergens';
import {
  calculateServingsPerPackage,
  isSugarAddedIngredientName,
  tacoItemToIngredient,
} from '../utils/nutritionCalculator';
import { useAuth } from '../contexts/AuthContext';

interface RecipeFormProps {
  recipe: Recipe;
  onChange: (updatedRecipe: Recipe) => void;
  onSaveToHistory: () => void;
  onViewLabel: () => void;
}

interface QuickShortcut {
  label: string;
  query: string;
  tacoId: string;
}

const QUICK_TACO_SHORTCUTS: QuickShortcut[] = [
  { label: 'Farinha de trigo', query: 'Farinha de trigo', tacoId: '35' },
  { label: 'Açúcar refinado', query: 'Açúcar refinado', tacoId: '494' },
  { label: 'Ovo de galinha', query: 'Ovo de galinha inteiro cru', tacoId: '489' },
  { label: 'Manteiga com sal', query: 'Manteiga com sal', tacoId: '261' },
  { label: 'Leite integral', query: 'Leite de vaca integral', tacoId: '458' },
  { label: 'Leite condensado', query: 'Leite condensado', tacoId: '453' },
  { label: 'Polvilho doce', query: 'Polvilho doce', tacoId: '146' },
  { label: 'Cenoura crua', query: 'Cenoura crua', tacoId: '110' },
  { label: 'Fermento químico', query: 'Fermento em pó químico', tacoId: '513' },
  { label: 'Aveia em flocos', query: 'Aveia flocos crua', tacoId: '7' },
];

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const num = Number(trimmed.replace(',', '.'));
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function getMissingTacoLabels(ing: Ingredient): string[] {
  const n = ing.nutritionPer100g;
  const missing: string[] = [];
  if (n.energyKcal === null) missing.push('Energia');
  if (n.carbohydrates === null) missing.push('Carboidratos');
  if (n.proteins === null) missing.push('Proteínas');
  if (n.totalFat === null) missing.push('Gord. totais');
  if (n.saturatedFat === null) missing.push('Gord. saturadas');
  if (n.transFat === null) missing.push('Gord. trans');
  if (n.dietaryFiber === null) missing.push('Fibra');
  if (n.sodium === null) missing.push('Sódio');
  return missing;
}

export const RecipeForm: React.FC<RecipeFormProps> = ({
  recipe,
  onChange,
  onSaveToHistory,
  onViewLabel,
}) => {
  const { getToken } = useAuth();
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [ingredientGrams, setIngredientGrams] = useState<number | ''>(100);
  const [tacoSuggestions, setTacoSuggestions] = useState<TacoSearchItem[]>([]);
  const [isSearchingTaco, setIsSearchingTaco] = useState(false);

  const [isAiLoading, setIsAiLoading] = useState(false);
  const [matchCandidates, setMatchCandidates] = useState<TacoSearchItem[]>([]);
  const [matchPromptNote, setMatchPromptNote] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [loadingShortcutId, setLoadingShortcutId] = useState<string | null>(null);

  // Estado para formulário de ingrediente manual (ficha técnica)
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualGrams, setManualGrams] = useState('100');
  const [manualKcal, setManualKcal] = useState('');
  const [manualCarbs, setManualCarbs] = useState('');
  const [manualTotalSugars, setManualTotalSugars] = useState('');
  const [manualAddedSugars, setManualAddedSugars] = useState('0');
  const [manualIsAddedSugar, setManualIsAddedSugar] = useState(false);
  const [manualProteins, setManualProteins] = useState('');
  const [manualTotalFat, setManualTotalFat] = useState('');
  const [manualSatFat, setManualSatFat] = useState('');
  const [manualTransFat, setManualTransFat] = useState('');
  const [manualFiber, setManualFiber] = useState('');
  const [manualSodium, setManualSodium] = useState('');
  const [manualLabelName, setManualLabelName] = useState('');
  const [manualIsAdditive, setManualIsAdditive] = useState(false);
  const [manualAdditiveFunction, setManualAdditiveFunction] = useState('');
  const [manualAllergenDeclarations, setManualAllergenDeclarations] = useState<
    IngredientAllergenDeclaration[]
  >([]);
  const [manualGluten, setManualGluten] = useState(false);

  // Estado para trocar ingrediente legado/IA por item da TACO
  const [replacingIngredientId, setReplacingIngredientId] = useState<string | null>(null);
  const [replaceQuery, setReplaceQuery] = useState('');
  const [replaceResults, setReplaceResults] = useState<TacoSearchItem[]>([]);
  const [isSearchingReplace, setIsSearchingReplace] = useState(false);

  // Busca automática na Tabela TACO via GET /api/taco/search?q=
  useEffect(() => {
    const q = ingredientSearch.trim();
    if (q.length < 2) {
      setTacoSuggestions([]);
      setIsSearchingTaco(false);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingTaco(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/taco/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('Falha na busca TACO');
        const data = await res.json();
        setTacoSuggestions(Array.isArray(data.items) ? data.items : []);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setTacoSuggestions([]);
        }
      } finally {
        setIsSearchingTaco(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ingredientSearch, getToken]);

  // Busca TACO ao vivo para substituição de item 'gemini_ai'
  useEffect(() => {
    if (!replacingIngredientId) {
      setReplaceResults([]);
      return;
    }
    const q = replaceQuery.trim();
    if (q.length < 2) {
      setReplaceResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearchingReplace(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/taco/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('Falha na busca TACO');
        const data = await res.json();
        setReplaceResults(Array.isArray(data.items) ? data.items : []);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setReplaceResults([]);
        }
      } finally {
        setIsSearchingReplace(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [replacingIngredientId, replaceQuery, getToken]);

  const showTempSuccess = (message: string) => {
    setFormSuccess(message);
    setTimeout(() => setFormSuccess(null), 3500);
  };

  const handleAddTacoItem = (tacoItem: TacoSearchItem) => {
    const grams = typeof ingredientGrams === 'number' && ingredientGrams > 0 ? ingredientGrams : 100;
    const newIngredient = tacoItemToIngredient(tacoItem, grams);

    onChange({
      ...recipe,
      ingredients: [...recipe.ingredients, newIngredient],
      updatedAt: new Date().toISOString(),
    });

    showTempSuccess(
      `"${newIngredient.name}" adicionado com dados da TACO (TACO nº ${tacoItem.tacoId}).`
    );
    setIngredientSearch('');
    setTacoSuggestions([]);
    setMatchCandidates([]);
    setMatchPromptNote(null);
    setIngredientGrams(100);
    setFormError(null);
  };

  const handleQuickShortcut = async (shortcut: QuickShortcut) => {
    setLoadingShortcutId(shortcut.tacoId);
    setFormError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/taco/search?q=${encodeURIComponent(shortcut.query)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('Erro ao consultar TACO');
      const data = await res.json();
      const items: TacoSearchItem[] = Array.isArray(data.items) ? data.items : [];
      const found = items.find((i) => i.tacoId === shortcut.tacoId) || items[0];
      if (!found) {
        setFormError(`Item "${shortcut.label}" não encontrado na Tabela TACO.`);
        return;
      }
      handleAddTacoItem(found);
    } catch {
      setFormError('Não foi possível buscar este item na Tabela TACO.');
    } finally {
      setLoadingShortcutId(null);
    }
  };

  // Correspondência assistida por IA via POST /api/taco/match
  const handleTacoMatch = async () => {
    if (!ingredientSearch.trim()) {
      setFormError('Digite o nome do alimento ou ingrediente para buscar na TACO.');
      return;
    }

    setIsAiLoading(true);
    setFormError(null);
    setFormSuccess(null);
    setMatchCandidates([]);
    setMatchPromptNote(null);

    try {
      const token = await getToken();
      const response = await fetch('/api/taco/match', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ingredientName: ingredientSearch.trim() }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao consultar servidor');
      }

      if (data.match) {
        handleAddTacoItem(data.match as TacoSearchItem);
        return;
      }

      const candidates: TacoSearchItem[] = Array.isArray(data.candidates) ? data.candidates : [];
      setMatchCandidates(candidates);

      if (data.aiFailed) {
        setMatchPromptNote(
          candidates.length > 0
            ? 'A IA está indisponível no momento. Selecione manualmente um dos candidatos da Tabela TACO abaixo ou cadastre como ingrediente manual:'
            : 'A IA está indisponível e não houve candidatos próximos na TACO. Você pode cadastrar o ingrediente manualmente pela ficha técnica.'
        );
      } else {
        setMatchPromptNote(
          candidates.length > 0
            ? 'Nenhum item exato foi confirmado automaticamente. Escolha um dos candidatos da Tabela TACO abaixo ou adicione manualmente:'
            : 'Nenhum item correspondente encontrado na Tabela TACO. Use o botão "Ingrediente manual (ficha técnica)" abaixo.'
        );
      }
    } catch (err: any) {
      console.error(err);
      setFormError(
        err?.message || 'Não foi possível consultar os candidatos da TACO no momento.'
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleOpenManualForm = () => {
    const prefillName = ingredientSearch.trim();
    const isSugar = prefillName ? isSugarAddedIngredientName(prefillName) : false;
    const suggestedAllergens = prefillName
      ? suggestAllergensFromIngredientName(prefillName)
      : [];
    const suggestedGluten = suggestedAllergens.some((d) =>
      Boolean(getAllergenDef(d.allergenId)?.triggersGluten)
    );
    setManualName(prefillName);
    setManualLabelName(prefillName.toLowerCase());
    setManualIsAdditive(false);
    setManualAdditiveFunction('');
    setManualGrams(String(ingredientGrams || 100));
    setManualKcal('');
    setManualCarbs('');
    setManualTotalSugars('');
    setManualAddedSugars(isSugar ? '' : '0');
    setManualIsAddedSugar(isSugar);
    setManualProteins('');
    setManualTotalFat('');
    setManualSatFat('');
    setManualTransFat('');
    setManualFiber('');
    setManualSodium('');
    setManualAllergenDeclarations(suggestedAllergens);
    setManualGluten(suggestedGluten);
    setShowManualForm(true);
    setFormError(null);
  };

  const handleManualAddedSugarToggle = (checked: boolean) => {
    setManualIsAddedSugar(checked);
    if (checked) {
      setManualAddedSugars(manualCarbs);
      setManualTotalSugars(manualCarbs);
    } else {
      setManualAddedSugars('0');
      setManualTotalSugars('');
    }
  };

  const handleManualCarbsChange = (val: string) => {
    setManualCarbs(val);
    if (manualIsAddedSugar) {
      setManualAddedSugars(val);
      setManualTotalSugars(val);
    }
  };

  const handleManualToggleAllergen = (allergenId: AllergenId) => {
    setManualAllergenDeclarations((prev) => {
      const exists = prev.some((d) => d.allergenId === allergenId);
      const next = exists
        ? prev.filter((d) => d.allergenId !== allergenId)
        : [...prev, { allergenId, presence: 'contains' as AllergenPresence }];
      const hasGluten = next.some((d) =>
        Boolean(getAllergenDef(d.allergenId)?.triggersGluten)
      );
      if (hasGluten) setManualGluten(true);
      return next;
    });
  };

  const handleManualAllergenPresence = (
    allergenId: AllergenId,
    presence: AllergenPresence
  ) => {
    setManualAllergenDeclarations((prev) =>
      prev.map((d) => (d.allergenId === allergenId ? { ...d, presence } : d))
    );
  };

  const handleAddWater = () => {
    const grams =
      typeof ingredientGrams === 'number' && ingredientGrams > 0 ? ingredientGrams : 100;
    const waterIngredient: Ingredient = {
      id: `ing-water-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: 'Água',
      labelName: 'água',
      grams,
      nutritionPer100g: {
        energyKcal: 0,
        energyKj: 0,
        carbohydrates: 0,
        totalSugars: 0,
        addedSugars: 0,
        proteins: 0,
        totalFat: 0,
        saturatedFat: 0,
        transFat: 0,
        dietaryFiber: 0,
        sodium: 0,
      },
      tacoId: null,
      allergens: [],
      allergenDeclarations: [],
      containsGluten: false,
      source: 'manual',
      isAddedSugar: false,
    };

    onChange({
      ...recipe,
      ingredients: [...recipe.ingredients, waterIngredient],
      updatedAt: new Date().toISOString(),
    });
    showTempSuccess(`Água (${grams} g) adicionada à receita e à lista de ingredientes.`);
  };

  const handleAddManualIngredient = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = manualName.trim();
    if (!cleanName) {
      setFormError('Informe o nome do ingrediente manual.');
      return;
    }

    const grams = parseOptionalNumber(manualGrams);
    if (!grams || grams <= 0) {
      setFormError('Informe a quantidade em gramas maior que zero.');
      return;
    }

    const kcal = parseOptionalNumber(manualKcal);
    const carbs = parseOptionalNumber(manualCarbs);
    const totalSugars = manualIsAddedSugar ? carbs : parseOptionalNumber(manualTotalSugars);
    const addedSugars = manualIsAddedSugar ? carbs : (parseOptionalNumber(manualAddedSugars) ?? 0);

    const newIngredient: Ingredient = {
      id: `ing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanName,
      labelName: manualLabelName.trim() || cleanName.toLowerCase(),
      isAdditive: manualIsAdditive,
      additiveFunction: manualIsAdditive ? manualAdditiveFunction.trim() : undefined,
      grams,
      nutritionPer100g: {
        energyKcal: kcal,
        energyKj: kcal !== null ? Math.round(kcal * 4.184) : null,
        carbohydrates: carbs,
        totalSugars,
        addedSugars,
        proteins: parseOptionalNumber(manualProteins),
        totalFat: parseOptionalNumber(manualTotalFat),
        saturatedFat: parseOptionalNumber(manualSatFat),
        transFat: parseOptionalNumber(manualTransFat),
        dietaryFiber: parseOptionalNumber(manualFiber),
        sodium: parseOptionalNumber(manualSodium),
      },
      tacoId: null,
      allergens: manualAllergenDeclarations.map((d) => d.allergenId),
      allergenDeclarations: manualAllergenDeclarations,
      containsGluten:
        manualGluten ||
        manualAllergenDeclarations.some((d) =>
          Boolean(getAllergenDef(d.allergenId)?.triggersGluten)
        ),
      source: 'manual',
      isAddedSugar: manualIsAddedSugar,
    };

    onChange({
      ...recipe,
      ingredients: [...recipe.ingredients, newIngredient],
      updatedAt: new Date().toISOString(),
    });

    showTempSuccess(`"${cleanName}" adicionado como ingrediente informado pelo usuário.`);
    setShowManualForm(false);
    setIngredientSearch('');
    setFormError(null);
  };

  const handleRemoveIngredient = (id: string) => {
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.filter((i) => i.id !== id),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateIngredientGrams = (id: string, grams: number) => {
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((item) =>
        item.id === id ? { ...item, grams: Math.max(0, grams) } : item
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateIngredientLabelFields = (
    id: string,
    patch: Partial<Pick<Ingredient, 'labelName' | 'isAdditive' | 'additiveFunction'>>
  ) => {
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateIngredientAllergens = (
    id: string,
    nextDeclarations: IngredientAllergenDeclaration[]
  ) => {
    const hasGluten = nextDeclarations.some((d) =>
      Boolean(getAllergenDef(d.allergenId)?.triggersGluten)
    );
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((item) =>
        item.id === id
          ? {
              ...item,
              allergenDeclarations: nextDeclarations,
              allergens: nextDeclarations.map((d) => d.allergenId),
              containsGluten: hasGluten,
            }
          : item
      ),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleToggleMayContainAllergen = (allergenId: AllergenId) => {
    const current = recipe.mayContainAllergens || [];
    const exists = current.includes(allergenId);
    const next = exists
      ? current.filter((id) => id !== allergenId)
      : [...current, allergenId];
    onChange({
      ...recipe,
      mayContainAllergens: next,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUpdateIngredientSugar = (
    id: string,
    field: 'totalSugars' | 'addedSugars',
    rawValue: string
  ) => {
    const parsed = parseOptionalNumber(rawValue);
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          nutritionPer100g: {
            ...item.nutritionPer100g,
            [field]: parsed,
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleToggleIngredientIsAddedSugar = (id: string, checked: boolean) => {
    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((item) => {
        if (item.id !== id) return item;
        const carbs = item.nutritionPer100g.carbohydrates;
        return {
          ...item,
          isAddedSugar: checked,
          nutritionPer100g: {
            ...item.nutritionPer100g,
            addedSugars: checked ? carbs : 0,
            totalSugars: checked ? carbs : null,
          },
        };
      }),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleReplaceWithTacoItem = (ingredientId: string, tacoItem: TacoSearchItem) => {
    const existing = recipe.ingredients.find((i) => i.id === ingredientId);
    if (!existing) return;

    const replacement = tacoItemToIngredient(tacoItem, existing.grams, {
      existingId: existing.id,
    });

    onChange({
      ...recipe,
      ingredients: recipe.ingredients.map((item) =>
        item.id === ingredientId ? replacement : item
      ),
      updatedAt: new Date().toISOString(),
    });

    setReplacingIngredientId(null);
    setReplaceQuery('');
    setReplaceResults([]);
    showTempSuccess(
      `"${replacement.name}" atualizado com dados da TACO (TACO nº ${tacoItem.tacoId}).`
    );
  };

  const totalRawWeight = recipe.ingredients.reduce((acc, curr) => acc + curr.grams, 0);

  const ingredientsMissingTotalSugars = recipe.ingredients.filter(
    (ing) =>
      ing.nutritionPer100g.totalSugars === null ||
      ing.nutritionPer100g.totalSugars === undefined
  );

  const frontalExemption = evaluateFrontalExemption(
    recipe.productCategory,
    recipe.hasAddedCriticalIngredients
  );
  const lupaDimensions = getFrontalMagnifierDimensions(recipe.panelArea);
  const generalCategories = ANVISA_PRODUCT_CATEGORIES.filter((c) => c.group === 'general');
  const alwaysExemptCategories = ANVISA_PRODUCT_CATEGORIES.filter(
    (c) => c.group === 'always_exempt'
  );
  const conditionalExemptCategories = ANVISA_PRODUCT_CATEGORIES.filter(
    (c) => c.group === 'conditional_exempt'
  );
  const allergenStatements = buildAllergenStatements(recipe);
  const glutenResolution = resolveGlutenStatus(recipe);
  const ingredientsListPreview = buildIngredientsListText(recipe.ingredients);

  // Sugestões de porção e medidas caseiras comuns segundo IN 75/2020
  const quickMeasures = [
    { portion: 60, measure: '1 fatia média (60 g)', label: 'Bolo / Torta' },
    { portion: 50, measure: '2 unidades pequenas (50 g)', label: 'Pão de Queijo' },
    { portion: 30, measure: '2 colheres de sopa (30 g)', label: 'Patês / Pastas' },
    { portion: 40, measure: '1/2 xícara de chá (40 g)', label: 'Granola / Cereais' },
    { portion: 100, measure: '1 hambúrguer (100 g)', label: 'Hambúrguer' },
    { portion: 200, measure: '1 copo (200 ml)', label: 'Bebidas (200 ml)', isLiquid: true },
  ];

  return (
    <div className="space-y-5 sm:space-y-6 pb-4 sm:pb-12">
      {/* Bloco 1: Identificação do Produto / Receita */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
            1
          </div>
          <h2 className="text-base font-bold text-slate-900 min-w-0 break-words">
            Identificação da Receita ou Produto
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 min-w-0">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Nome do Prato / Produto Alimentício *
            </label>
            <input
              type="text"
              value={recipe.name}
              onChange={(e) => onChange({ ...recipe, name: e.target.value })}
              placeholder="Ex: Bolo de Cenoura com Chocolate, Pão de Queijo..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 font-medium text-sm transition"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Categoria do Alimento
            </label>
            <input
              type="text"
              value={recipe.category}
              onChange={(e) => onChange({ ...recipe, category: e.target.value })}
              placeholder="Ex: Panificação, Confeitaria, Salgados..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-800 text-sm"
            />
          </div>

          <div className="min-w-0">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Tipo do Produto
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...recipe, isLiquid: false })}
                className={`py-2 px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center justify-center text-center leading-tight border transition cursor-pointer ${
                  !recipe.isLiquid
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Sólido / Semi-sólido (g)
              </button>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...recipe,
                    isLiquid: true,
                    density: recipe.density && recipe.density > 0 ? recipe.density : 1,
                  })
                }
                className={`py-2 px-2.5 sm:px-3 rounded-xl text-xs font-semibold flex items-center justify-center text-center leading-tight border transition cursor-pointer ${
                  recipe.isLiquid
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Líquido / Bebida (ml)
              </button>
            </div>
          </div>

          {recipe.isLiquid && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Densidade (g/ml)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0.1"
                  step="0.01"
                  value={recipe.density ?? 1}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    onChange({
                      ...recipe,
                      density: Number.isFinite(val) && val > 0 ? val : 1,
                    });
                  }}
                  placeholder="1,00"
                  className="w-full pl-3.5 pr-12 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 font-semibold text-sm"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  g/ml
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Padrão 1 g/ml (água). Ex.: leite integral ≈ 1,03 g/ml.
              </p>
            </div>
          )}

          <div className="md:col-span-2 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
            <div className="min-w-0">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Categoria do Produto (Exceções Lupa — Anexo XVI)
              </label>
              <select
                value={recipe.productCategory || 'geral'}
                onChange={(e) =>
                  onChange({
                    ...recipe,
                    productCategory: e.target.value as FrontalProductCategory,
                  })
                }
                className="w-full max-w-full min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-800 text-sm bg-white"
              >
                <optgroup label="Regra geral">
                  {generalCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Isentos sempre (Anexo XVI)">
                  {alwaysExemptCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Isentos apenas sem adição de açúcar, gord. saturada ou sódio">
                  {conditionalExemptCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Foram adicionados ingredientes que acrescentam açúcar, gordura saturada ou sódio?
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChange({ ...recipe, hasAddedCriticalIngredients: false })}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    !recipe.hasAddedCriticalIngredients
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Não
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ ...recipe, hasAddedCriticalIngredients: true })}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    recipe.hasAddedCriticalIngredients
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Sim
                </button>
              </div>
            </div>

            {frontalExemption.isExempt && frontalExemption.reason && (
              <div className="md:col-span-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
                <Check className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Produto isento de Lupa Frontal:</span>{' '}
                  {frontalExemption.reason}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bloco 2: Porção e Embalagem (Regras ANVISA RDC 429/2020) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
              2
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                Porção e Medida Caseira (Padrão ANVISA)
              </h2>
              <p className="text-xs text-slate-500">
                Obrigatório para compor as colunas do rótulo e cálculo do %VD
              </p>
            </div>
          </div>
        </div>

        {/* Sugestões rápidas de porções */}
        <div className="mb-4">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">
            Atalhos rápidos por categoria de produto:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {quickMeasures.map((qm) => (
              <button
                key={qm.label}
                type="button"
                onClick={() => {
                  const nextServings =
                    recipe.netWeight && recipe.netWeight > 0
                      ? calculateServingsPerPackage(recipe.netWeight, qm.portion)
                      : recipe.servingsPerPackage;
                  onChange({
                    ...recipe,
                    portionSize: qm.portion,
                    householdMeasure: qm.measure,
                    isLiquid: !!qm.isLiquid,
                    density: qm.isLiquid ? (recipe.density || 1) : 1,
                    servingsPerPackage: nextServings,
                  });
                }}
                className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 border border-slate-200/70 transition"
              >
                {qm.label} ({qm.portion}
                {qm.isLiquid ? 'ml' : 'g'})
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Tamanho da Porção ({recipe.isLiquid ? 'ml' : 'g'}) *
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={recipe.portionSize || ''}
                onChange={(e) => {
                  const nextPortion = Math.max(1, Number(e.target.value));
                  const nextServings =
                    recipe.netWeight && recipe.netWeight > 0
                      ? calculateServingsPerPackage(recipe.netWeight, nextPortion)
                      : recipe.servingsPerPackage;
                  onChange({
                    ...recipe,
                    portionSize: nextPortion,
                    servingsPerPackage: nextServings,
                  });
                }}
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 font-semibold text-sm"
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                {recipe.isLiquid ? 'ml' : 'g'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Medida Caseira Correspondente *
            </label>
            <input
              type="text"
              value={recipe.householdMeasure}
              onChange={(e) => onChange({ ...recipe, householdMeasure: e.target.value })}
              placeholder="Ex: 1 fatia, 2 colheres de sopa, 1 unidade..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Conteúdo Líquido ({recipe.isLiquid ? 'ml' : 'g'})
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={recipe.netWeight ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  const nextNetWeight = raw ? Math.max(1, Number(raw)) : undefined;
                  const nextServings =
                    nextNetWeight && recipe.portionSize > 0
                      ? calculateServingsPerPackage(nextNetWeight, recipe.portionSize)
                      : recipe.servingsPerPackage;
                  onChange({
                    ...recipe,
                    netWeight: nextNetWeight,
                    servingsPerPackage: nextServings,
                  });
                }}
                placeholder="Opcional"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 text-sm"
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                {recipe.isLiquid ? 'ml' : 'g'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Porções por Embalagem *
            </label>
            <input
              type="text"
              value={recipe.servingsPerPackage}
              onChange={(e) => onChange({ ...recipe, servingsPerPackage: e.target.value })}
              placeholder="Ex: cerca de 10, 8..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-900 text-sm"
            />
          </div>
        </div>

        {/* Rendimento Final e Área do Painel Principal */}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="space-y-2">
            <div className="text-slate-600">
              <span className="font-semibold text-slate-800">Peso Total Bruto dos Ingredientes:</span>{' '}
              <span className="font-bold text-emerald-700">{totalRawWeight} g</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-slate-600 font-medium">
                Rendimento final pronto (após cocção/assar):
              </label>
              <input
                type="number"
                min="1"
                value={recipe.readyWeightGrams || ''}
                onChange={(e) =>
                  onChange({
                    ...recipe,
                    readyWeightGrams: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                placeholder={`${totalRawWeight || 100} g`}
                className="w-24 px-2 py-1 text-xs rounded-lg border border-slate-200 text-center font-bold text-slate-800 focus:border-emerald-500 outline-none"
              />
              <span className="text-slate-500 text-[11px]">(opcional)</span>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-slate-600 font-medium">
                Área do painel principal da embalagem (cm²):
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={recipe.panelArea ?? ''}
                onChange={(e) => {
                  const raw = e.target.value;
                  onChange({
                    ...recipe,
                    panelArea: raw ? Math.max(1, Number(raw)) : undefined,
                  });
                }}
                placeholder="150"
                className="w-24 px-2 py-1 text-xs rounded-lg border border-slate-200 text-center font-bold text-slate-800 focus:border-emerald-500 outline-none"
              />
              <span className="text-slate-500 text-[11px]">cm²</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Dimensiona a lupa frontal (Anexo XVII): faixa <strong>{lupaDimensions.label}</strong> → altura {lupaDimensions.heightMm} mm.
            </p>
          </div>
        </div>
      </div>

      {/* Bloco 3: Ingredientes e Tabela TACO / Manual */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
              3
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                Ingredientes & Tabela TACO / UNICAMP
              </h2>
              <p className="text-xs text-slate-500">
                Pesquise na Tabela TACO oficial (4ª edição) ou informe os dados da ficha técnica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleAddWater}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 hover:bg-sky-100 text-sky-800 flex items-center gap-1.5 transition cursor-pointer"
              title="Adicionar água potável (entra na lista de ingredientes em ordem decrescente)"
            >
              <Droplets className="w-3.5 h-3.5 text-sky-600" />
              <span>+ Água</span>
            </button>
            <button
              type="button"
              onClick={() =>
                showManualForm ? setShowManualForm(false) : handleOpenManualForm()
              }
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 transition cursor-pointer"
            >
              <FileEdit className="w-3.5 h-3.5 text-emerald-700" />
              <span>{showManualForm ? 'Fechar ficha manual' : '+ Ingrediente manual'}</span>
            </button>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
              {recipe.ingredients.length}{' '}
              {recipe.ingredients.length === 1 ? 'ingrediente' : 'ingredientes'}
            </span>
          </div>
        </div>

        {/* Barra de Adição de Ingrediente via TACO */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
            <div className="sm:col-span-7 relative">
              <input
                type="text"
                value={ingredientSearch}
                onChange={(e) => {
                  setIngredientSearch(e.target.value);
                  setMatchCandidates([]);
                  setMatchPromptNote(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (tacoSuggestions.length > 0) {
                      handleAddTacoItem(tacoSuggestions[0]);
                    } else {
                      handleTacoMatch();
                    }
                  }
                }}
                placeholder="Digite o ingrediente (ex: Farinha de trigo, Leite condensado, Maçã...)"
                className="w-full pl-3.5 pr-8 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none"
              />
              {ingredientSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setIngredientSearch('');
                    setTacoSuggestions([]);
                    setMatchCandidates([]);
                    setMatchPromptNote(null);
                  }}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={ingredientGrams}
                  onChange={(e) =>
                    setIngredientGrams(e.target.value === '' ? '' : Number(e.target.value))
                  }
                  placeholder="Gramas"
                  className="w-full pl-3 pr-7 py-2.5 text-sm rounded-xl border border-slate-300 bg-white font-semibold text-slate-900 focus:border-emerald-600 outline-none"
                />
                <span className="absolute right-2.5 top-2.5 text-xs font-bold text-slate-400">
                  g
                </span>
              </div>
            </div>

            <div className="sm:col-span-3 flex gap-2">
              <button
                type="button"
                disabled={isAiLoading || !ingredientSearch.trim()}
                onClick={handleTacoMatch}
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition shadow-xs cursor-pointer"
                title="Identificar correspondência na Tabela TACO oficial"
              >
                {isAiLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Buscando...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Feedback de erro ou sucesso */}
          {formError && (
            <div className="mt-2 text-xs text-rose-600 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {formSuccess && (
            <div className="mt-2 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          {/* Candidatos retornados quando /api/taco/match não escolhe automaticamente ou Gemini falha */}
          {matchPromptNote && (
            <div className="mt-2.5 border border-amber-200 bg-amber-50/70 rounded-xl overflow-hidden">
              <div className="px-3 py-2 text-xs text-amber-900 font-medium flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/70">
                <span className="flex items-start gap-1.5 min-w-0 flex-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span className="min-w-0 break-words">{matchPromptNote}</span>
                </span>
                <button
                  type="button"
                  onClick={handleOpenManualForm}
                  className="px-2 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-bold shrink-0 cursor-pointer"
                >
                  Informar manual
                </button>
              </div>
              {matchCandidates.length > 0 && (
                <div className="divide-y divide-amber-100 bg-white">
                  {matchCandidates.map((item) => (
                    <button
                      key={item.tacoId}
                      type="button"
                      onClick={() => handleAddTacoItem(item)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50/70 flex items-center justify-between gap-2 transition group cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 group-hover:text-emerald-900 block break-words">
                          {item.nome}
                        </span>
                        <span className="text-[10px] text-slate-500 block break-words">
                          TACO nº {item.tacoId} • {item.categoria} •{' '}
                          {item.energiaKcal !== null
                            ? `${Math.round(item.energiaKcal)} kcal/100g`
                            : 'kcal N/D'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-700 text-xs font-semibold shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                        <span>Escolher</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dropdown de sugestões instantâneas da TACO via API */}
          {(isSearchingTaco || tacoSuggestions.length > 0) && !matchPromptNote && (
            <div className="mt-2.5 border border-slate-200 bg-white rounded-xl divide-y divide-slate-100 overflow-hidden shadow-sm">
              <div className="px-3 py-1.5 bg-slate-100/70 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex flex-wrap items-center justify-between gap-1">
                <span>Itens da Tabela TACO / UNICAMP (4ª ed.)</span>
                <span className="text-emerald-700">
                  {isSearchingTaco ? 'Pesquisando...' : 'Clique para adicionar'}
                </span>
              </div>
              {tacoSuggestions.map((item) => (
                <button
                  key={item.tacoId}
                  type="button"
                  onClick={() => handleAddTacoItem(item)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50/70 flex items-center justify-between gap-2 transition group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-800 group-hover:text-emerald-900 block break-words">
                      {item.nome}
                    </span>
                    <span className="text-[10px] text-slate-400 block break-words">
                      TACO nº {item.tacoId} • {item.categoria} •{' '}
                      {item.energiaKcal !== null
                        ? `${Math.round(item.energiaKcal)} kcal/100g`
                        : 'kcal N/D'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-700 text-xs font-semibold shrink-0">
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ {ingredientGrams || 100}g</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Atalhos rápidos de ingredientes comuns da culinária brasileira */}
          <div className="mt-3 pt-2.5 border-t border-slate-200/60">
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Ingredientes populares na confeitaria e panificação brasileira:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TACO_SHORTCUTS.map((shortcut) => (
                <button
                  key={shortcut.tacoId}
                  type="button"
                  disabled={loadingShortcutId === shortcut.tacoId}
                  onClick={() => handleQuickShortcut(shortcut)}
                  className="px-2 py-1 text-[11px] rounded-lg bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-800 text-slate-700 transition cursor-pointer disabled:opacity-50"
                >
                  {loadingShortcutId === shortcut.tacoId ? '...' : `+ ${shortcut.label}`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Formulário de Ingrediente Manual (Ficha Técnica do Fornecedor) */}
        {showManualForm && (
          <form
            onSubmit={handleAddManualIngredient}
            className="mb-5 p-3 sm:p-4 rounded-xl border border-slate-300 bg-slate-50/70 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900">
                  Novo Ingrediente Manual (Ficha Técnica do Fornecedor)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Informe os valores nutricionais referentes a 100 g do ingrediente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2 min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nome do Ingrediente *
                </label>
                <input
                  type="text"
                  required
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Ex: Chocolate meio amargo 70% (Fornecedor X)"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div className="min-w-0">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Quantidade na receita (g) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={manualGrams}
                  onChange={(e) => setManualGrams(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600 font-semibold"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Energia (kcal/100g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualKcal}
                  onChange={(e) => setManualKcal(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Carboidratos (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualCarbs}
                  onChange={(e) => handleManualCarbsChange(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Açúcares totais (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualTotalSugars}
                  onChange={(e) => setManualTotalSugars(e.target.value)}
                  placeholder="Vazio"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Açúcares adic. (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualAddedSugars}
                  onChange={(e) => setManualAddedSugars(e.target.value)}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Proteínas (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualProteins}
                  onChange={(e) => setManualProteins(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Gord. totais (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualTotalFat}
                  onChange={(e) => setManualTotalFat(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Gord. saturadas (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualSatFat}
                  onChange={(e) => setManualSatFat(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Gord. trans (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualTransFat}
                  onChange={(e) => setManualTransFat(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Fibra alim. (g)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualFiber}
                  onChange={(e) => setManualFiber(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                  Sódio (mg)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualSodium}
                  onChange={(e) => setManualSodium(e.target.value)}
                  placeholder="N/D"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nome no rótulo (lista de ingredientes)
                </label>
                <input
                  type="text"
                  value={manualLabelName}
                  onChange={(e) => setManualLabelName(e.target.value)}
                  placeholder="Ex: chocolate meio amargo"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualIsAdditive}
                    onChange={(e) => setManualIsAdditive(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>É aditivo alimentar</span>
                </label>
              </div>
              {manualIsAdditive && (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Função do aditivo
                  </label>
                  <input
                    type="text"
                    value={manualAdditiveFunction}
                    onChange={(e) => setManualAdditiveFunction(e.target.value)}
                    placeholder="Ex: fermento químico, conservador"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white outline-none focus:border-emerald-600"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1 border-t border-slate-200/80">
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualIsAddedSugar}
                    onChange={(e) => handleManualAddedSugarToggle(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>É açúcar adicionado</span>
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualGluten}
                    onChange={(e) => setManualGluten(e.target.checked)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Contém glúten</span>
                </label>
              </div>

              <div>
                <span className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                  Alergênicos deste ingrediente (lista fechada RDC 727/2022):
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {RDC_727_ALLERGENS.map((def) => {
                    const selected = manualAllergenDeclarations.find(
                      (d) => d.allergenId === def.id
                    );
                    return (
                      <div
                        key={def.id}
                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] transition ${
                          selected
                            ? 'bg-rose-50 border-rose-300 text-rose-900'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleManualToggleAllergen(def.id)}
                          className="font-medium cursor-pointer"
                        >
                          {def.label}
                        </button>
                        {selected && (
                          <select
                            value={selected.presence}
                            onChange={(e) =>
                              handleManualAllergenPresence(
                                def.id,
                                e.target.value as AllergenPresence
                              )
                            }
                            className="ml-1 text-[10px] font-bold bg-white border border-rose-200 rounded px-1 py-0.5 outline-none"
                          >
                            <option value="contains">Contém</option>
                            <option value="derivatives">Derivados de</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Salvar Ingrediente Manual</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Aviso se houver ingrediente sem açúcares totais informados */}
        {ingredientsMissingTotalSugars.length > 0 && (
          <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-amber-900">
                Ingredientes sem açúcares totais informados ({ingredientsMissingTotalSugars.length})
              </div>
              <p className="mt-0.5 text-amber-800 leading-relaxed">
                A Tabela TACO não informa açúcares. Preencha o campo{' '}
                <strong>Açúcares totais (g/100g)</strong> ou marque{' '}
                <strong>&quot;É açúcar adicionado&quot;</strong> em:{' '}
                <span className="font-semibold">
                  {ingredientsMissingTotalSugars.map((i) => i.name).join(', ')}
                </span>
                .
              </p>
            </div>
          </div>
        )}

        {/* Lista de ingredientes já adicionados na receita */}
        {recipe.ingredients.length === 0 ? (
          <div className="text-center py-8 px-4 border-2 border-dashed border-slate-200 rounded-xl">
            <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              Nenhum ingrediente adicionado ainda
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Digite os ingredientes acima, clique nos atalhos rápidos ou informe manualmente pela ficha técnica.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
            <div className="hidden sm:grid bg-slate-50 px-3.5 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider grid-cols-12 gap-2">
              <span className="col-span-7">Ingrediente & Origem</span>
              <span className="col-span-3 text-right">Quantidade</span>
              <span className="col-span-2 text-right">Ação</span>
            </div>

            {recipe.ingredients.map((item) => {
              const missingTaco = item.source === 'taco' ? getMissingTacoLabels(item) : [];
              const missingTotalSugars =
                item.nutritionPer100g.totalSugars === null ||
                item.nutritionPer100g.totalSugars === undefined;
              const isGeminiLegacy = item.source === 'gemini_ai';
              const isLegacyLocal = item.source === 'taco_local' && !item.tacoId;
              const needsReview = isGeminiLegacy || isLegacyLocal;

              return (
                <div
                  key={item.id}
                  className="px-3 sm:px-3.5 py-3 text-xs hover:bg-slate-50/60 transition space-y-2.5"
                >
                  <div className="flex flex-col sm:grid sm:grid-cols-12 gap-2.5 sm:gap-2 sm:items-center">
                    <div className="sm:col-span-7 min-w-0">
                      <div className="font-semibold text-slate-900 break-words">{item.name}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5 flex-wrap mt-1">
                        {/* Selo de origem */}
                        {item.source === 'manual' ? (
                          <span className="bg-slate-200/80 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                            Informado pelo usuário
                          </span>
                        ) : isGeminiLegacy ? (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                            Estimado por IA – revisar
                          </span>
                        ) : item.tacoId ? (
                          <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-bold">
                            TACO nº {item.tacoId}
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded font-bold">
                            TACO legado – revisar
                          </span>
                        )}

                        <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                          {item.nutritionPer100g.energyKcal !== null &&
                          item.nutritionPer100g.energyKcal !== undefined
                            ? `${Math.round(item.nutritionPer100g.energyKcal)} kcal/100g`
                            : 'kcal N/D'}
                        </span>

                        {missingTaco.length > 0 && (
                          <span
                            className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded break-words max-w-full"
                            title="Campos não disponíveis (*) ou ausentes na Tabela TACO"
                          >
                            N/D na TACO: {missingTaco.join(', ')}
                          </span>
                        )}
                      </div>

                      {needsReview && (
                        <div className="mt-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              if (replacingIngredientId === item.id) {
                                setReplacingIngredientId(null);
                              } else {
                                setReplacingIngredientId(item.id);
                                setReplaceQuery(item.name);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold transition cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3 h-3 shrink-0" />
                            <span>Trocar pelo item da TACO</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 sm:contents">
                      <div className="sm:col-span-3 sm:text-right flex items-center gap-1.5 sm:justify-end">
                        <span className="sm:hidden text-[11px] font-medium text-slate-600">
                          Quantidade:
                        </span>
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="1"
                            value={item.grams}
                            onChange={(e) =>
                              handleUpdateIngredientGrams(item.id, Number(e.target.value))
                            }
                            className="w-20 sm:w-16 px-2 py-1 text-right font-bold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg text-xs outline-none focus:border-emerald-500"
                          />
                          <span className="text-slate-500 font-semibold text-[11px]">g</span>
                        </div>
                      </div>

                      <div className="sm:col-span-2 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveIngredient(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Remover ingrediente"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Painel inline para trocar item 'gemini_ai' pelo item da TACO */}
                  {replacingIngredientId === item.id && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={replaceQuery}
                          onChange={(e) => setReplaceQuery(e.target.value)}
                          placeholder="Buscar substituto na TACO..."
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs rounded-lg border border-amber-300 bg-white outline-none focus:border-emerald-600"
                        />
                        <button
                          type="button"
                          onClick={() => setReplacingIngredientId(null)}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 shrink-0"
                        >
                          Cancelar
                        </button>
                      </div>
                      {isSearchingReplace ? (
                        <div className="text-[11px] text-slate-500">Buscando na Tabela TACO...</div>
                      ) : replaceResults.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto divide-y divide-amber-100 bg-white rounded-lg border border-amber-200">
                          {replaceResults.map((cand) => (
                            <button
                              key={cand.tacoId}
                              type="button"
                              onClick={() => handleReplaceWithTacoItem(item.id, cand)}
                              className="w-full text-left px-2.5 py-1.5 text-[11px] hover:bg-emerald-50 flex items-center justify-between gap-2 cursor-pointer"
                            >
                              <span className="min-w-0 flex-1 break-words">
                                <strong className="text-slate-800">{cand.nome}</strong>{' '}
                                <span className="text-slate-400">
                                  (TACO nº {cand.tacoId} •{' '}
                                  {cand.energiaKcal !== null
                                    ? `${Math.round(cand.energiaKcal)} kcal`
                                    : 'kcal N/D'}
                                  )
                                </span>
                              </span>
                              <span className="text-emerald-700 font-bold shrink-0">Selecionar</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          Digite ao menos 2 letras para buscar na TACO.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Campos editáveis de Açúcares (g/100g) conforme regra da TACO */}
                  <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2.5 sm:gap-3 text-[11px]">
                    <div className="flex items-center justify-between sm:justify-start gap-1.5">
                      <label className="text-slate-600 font-medium">
                        Açúcares totais (g/100g):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.nutritionPer100g.totalSugars ?? ''}
                        onChange={(e) =>
                          handleUpdateIngredientSugar(item.id, 'totalSugars', e.target.value)
                        }
                        placeholder="Não inf."
                        className={`w-20 px-2 py-1 text-right rounded-lg border text-xs font-semibold outline-none ${
                          missingTotalSugars
                            ? 'border-amber-400 bg-amber-50/70 text-amber-900 placeholder:text-amber-600'
                            : 'border-slate-200 bg-white text-slate-800 focus:border-emerald-500'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between sm:justify-start gap-1.5">
                      <label className="text-slate-600 font-medium">
                        Açúcares adic. (g/100g):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.nutritionPer100g.addedSugars ?? ''}
                        onChange={(e) =>
                          handleUpdateIngredientSugar(item.id, 'addedSugars', e.target.value)
                        }
                        placeholder="0"
                        className="w-20 px-2 py-1 text-right rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-semibold outline-none focus:border-emerald-500"
                      />
                    </div>

                    <label className="inline-flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!item.isAddedSugar}
                        onChange={(e) =>
                          handleToggleIngredientIsAddedSugar(item.id, e.target.checked)
                        }
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>É açúcar adicionado</span>
                    </label>
                  </div>

                  {/* Nome editável no rótulo, aditivos (função + nome) e alergênicos fechados (RDC 727/2022) */}
                  {(() => {
                    const ingAllergens = getEffectiveIngredientAllergens(item);
                    const availableToAdd = RDC_727_ALLERGENS.filter(
                      (def) => !ingAllergens.some((d) => d.allergenId === def.id)
                    );
                    return (
                      <div className="pt-2 border-t border-slate-100 space-y-2 text-[11px]">
                        <div className="grid grid-cols-1 sm:flex sm:flex-wrap sm:items-center gap-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 flex-1 min-w-0">
                            <label className="text-slate-600 font-medium sm:whitespace-nowrap">
                              Nome no rótulo:
                            </label>
                            <input
                              type="text"
                              value={item.labelName ?? item.name.toLowerCase()}
                              onChange={(e) =>
                                handleUpdateIngredientLabelFields(item.id, {
                                  labelName: e.target.value,
                                })
                              }
                              placeholder={item.name.toLowerCase()}
                              className="w-full sm:flex-1 min-w-0 px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs outline-none focus:border-emerald-500"
                            />
                          </div>

                          <label className="inline-flex items-center gap-1.5 text-slate-700 font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!item.isAdditive}
                              onChange={(e) =>
                                handleUpdateIngredientLabelFields(item.id, {
                                  isAdditive: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>Aditivo alimentar</span>
                          </label>

                          {item.isAdditive && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 min-w-0">
                              <label className="text-slate-600 font-medium">Função:</label>
                              <input
                                type="text"
                                value={item.additiveFunction ?? ''}
                                onChange={(e) =>
                                  handleUpdateIngredientLabelFields(item.id, {
                                    additiveFunction: e.target.value,
                                  })
                                }
                                placeholder="Ex: fermento químico"
                                className="w-full sm:w-40 px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs outline-none focus:border-emerald-500"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-slate-600 font-medium mr-1">
                            Alergênicos (confirmar/editar):
                          </span>
                          {ingAllergens.map((decl) => {
                            const def = getAllergenDef(decl.allergenId);
                            if (!def) return null;
                            return (
                              <span
                                key={decl.allergenId}
                                className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-900 px-2 py-0.5 rounded-lg max-w-full flex-wrap"
                              >
                                <span className="font-semibold">{def.label}</span>
                                <select
                                  value={decl.presence}
                                  onChange={(e) => {
                                    const nextPresence = e.target.value as AllergenPresence;
                                    handleUpdateIngredientAllergens(
                                      item.id,
                                      ingAllergens.map((d) =>
                                        d.allergenId === decl.allergenId
                                          ? { ...d, presence: nextPresence }
                                          : d
                                      )
                                    );
                                  }}
                                  className="text-[10px] font-bold bg-white border border-rose-200 rounded px-1 py-0.5 outline-none"
                                >
                                  <option value="contains">contém</option>
                                  <option value="derivatives">contém derivados de</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateIngredientAllergens(
                                      item.id,
                                      ingAllergens.filter(
                                        (d) => d.allergenId !== decl.allergenId
                                      )
                                    )
                                  }
                                  className="text-rose-500 hover:text-rose-800 font-bold ml-0.5 cursor-pointer"
                                  title="Remover alergênico"
                                >
                                  ×
                                </button>
                              </span>
                            );
                          })}

                          <select
                            value=""
                            onChange={(e) => {
                              const nextId = e.target.value as AllergenId;
                              if (!nextId) return;
                              handleUpdateIngredientAllergens(item.id, [
                                ...ingAllergens,
                                { allergenId: nextId, presence: 'contains' },
                              ]);
                            }}
                            className="w-full sm:w-auto max-w-full min-w-0 px-2 py-1 sm:py-0.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] outline-none focus:border-emerald-500"
                          >
                            <option value="">+ Adicionar alergênico...</option>
                            {availableToAdd.map((def) => (
                              <option key={def.id} value={def.id}>
                                {def.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bloco 4: Alergênicos, Glúten, Lactose e Prévia da Lista de Ingredientes */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-5 shadow-xs space-y-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm shrink-0">
            4
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">
              Alergênicos, Glúten, Lactose & Lista de Ingredientes
            </h2>
            <p className="text-xs text-slate-500">
              Declarações obrigatórias segundo RDC 727/2022, Lei 10.674/2003 e RDC 136/2017
            </p>
          </div>
        </div>

        {/* Prévia da Lista de Ingredientes */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
          <div className="font-bold uppercase text-slate-700 mb-1">
            Prévia da Lista de Ingredientes (ordem decrescente):
          </div>
          {ingredientsListPreview ? (
            <p className="text-slate-900 break-words">
              <strong className="uppercase">INGREDIENTES:</strong> {ingredientsListPreview}
            </p>
          ) : (
            <p className="text-slate-500">Adicione ingredientes para gerar a lista.</p>
          )}
        </div>

        {/* Resumo dos alergênicos dos ingredientes + Contaminação cruzada ("Pode conter") */}
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1">
            <div className="font-bold uppercase text-slate-700">
              Alergênicos confirmados nos ingredientes:
            </div>
            {allergenStatements.containsSentence ? (
              <p className="font-bold uppercase text-slate-900">
                {allergenStatements.containsSentence}
              </p>
            ) : (
              <p className="text-slate-500">
                Nenhum alergênico declarado nos ingredientes (nenhuma frase de &quot;CONTÉM&quot; será exibida no rótulo).
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Contaminação Cruzada — ALÉRGICOS: PODE CONTER (opcional)
            </label>
            <div className="flex flex-wrap gap-1.5">
              {RDC_727_ALLERGENS.map((def) => {
                const checked = (recipe.mayContainAllergens || []).includes(def.id);
                return (
                  <button
                    key={def.id}
                    type="button"
                    onClick={() => handleToggleMayContainAllergen(def.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                      checked
                        ? 'bg-amber-100 border-amber-400 text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {checked ? `✓ ${def.label}` : def.label}
                  </button>
                );
              })}
            </div>
            {allergenStatements.mayContainSentence && (
              <p className="mt-2 text-xs font-bold uppercase text-amber-900">
                {allergenStatements.mayContainSentence}
              </p>
            )}
          </div>
        </div>

        {/* Glúten */}
        <div className="pt-3 border-t border-slate-100 space-y-2.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
            Declaração Obrigatória de Glúten (Lei nº 10.674/2003) *
          </label>

          {glutenResolution.hasGlutenCereal ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs">
              <span className="font-bold uppercase">CONTÉM GLÚTEN</span> — marcado automaticamente porque há trigo, centeio, cevada, aveia ou estirpes hibridizadas nos ingredientes ou em contaminação cruzada.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-950 text-xs leading-relaxed">
                <strong>Aviso sobre contaminação cruzada:</strong> Nunca declare &quot;NÃO CONTÉM GLÚTEN&quot; sem confirmação explícita. Só confirme ausência de glúten se tiver certeza de que não há contaminação cruzada por trigo, centeio, cevada ou aveia na origem dos ingredientes ou na linha de produção.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...recipe,
                      glutenStatus: 'does_not_contain',
                      containsGluten: false,
                    })
                  }
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition cursor-pointer ${
                    recipe.glutenStatus === 'does_not_contain'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Confirmo explicitamente: NÃO CONTÉM GLÚTEN (sem contaminação cruzada)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...recipe,
                      glutenStatus: 'contains',
                      containsGluten: true,
                    })
                  }
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border text-left transition cursor-pointer ${
                    recipe.glutenStatus === 'contains' || recipe.containsGluten
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Declarar: CONTÉM GLÚTEN (presença ou risco de contaminação cruzada)
                </button>
              </div>

              {glutenResolution.requiresConfirmation && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Confirmação obrigatória pendente: a exportação do rótulo fica bloqueada até você selecionar uma das opções acima.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lactose */}
        <div className="pt-3 border-t border-slate-100">
          <label className="inline-flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={!!recipe.containsLactose}
              onChange={(e) =>
                onChange({
                  ...recipe,
                  containsLactose: e.target.checked,
                })
              }
              className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              <strong className="uppercase">CONTÉM LACTOSE</strong> — marcar quando houver ingredientes lácteos com lactose acima do limite da RDC 136/2017
              {allergenStatements.hasAnyMilkAllergen && !recipe.containsLactose && (
                <span className="block text-[11px] text-amber-700 font-semibold mt-0.5">
                  Ingrediente lácteo detectado na receita: confirme se o produto contém lactose.
                </span>
              )}
            </span>
          </label>
        </div>
      </div>

      {/* Barra de Ações Inferior */}
      <div className="sm:sticky sm:bottom-4 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-slate-200 shadow-lg flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onSaveToHistory}
          disabled={!recipe.name || recipe.ingredients.length === 0}
          className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
        >
          <Bookmark className="w-4 h-4 shrink-0" />
          <span>Salvar no Histórico</span>
        </button>

        <button
          type="button"
          onClick={onViewLabel}
          disabled={recipe.ingredients.length === 0}
          className="w-full sm:flex-1 sm:max-w-sm px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50 cursor-pointer"
        >
          <Scale className="w-4 h-4 shrink-0" />
          <span>Ver Tabela & Rótulo ANVISA</span>
        </button>
      </div>
    </div>
  );
};
