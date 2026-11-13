/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface NumericNutritionValues {
  energyKcal: number;
  carbohydrates: number;
  totalSugars: number;
  addedSugars: number;
  proteins: number;
  totalFat: number;
  saturatedFat: number;
  transFat: number;
  dietaryFiber: number;
  sodium: number; // in mg
}

export interface NutritionValues {
  energyKcal: number | null;
  energyKj?: number | null;
  carbohydrates: number | null;
  totalSugars: number | null;
  addedSugars: number | null;
  proteins: number | null;
  totalFat: number | null;
  saturatedFat: number | null;
  transFat: number | null;
  dietaryFiber: number | null;
  sodium: number | null; // in mg
}

export interface TacoSearchItem {
  tacoId: string;
  nome: string;
  categoria: string;
  energiaKcal: number | null;
  energiaKj: number | null;
  proteinas: number | null;
  lipideos: number | null;
  carboidratos: number | null;
  fibra: number | null;
  sodio: number | null;
  gorduraSaturada: number | null;
  gorduraTrans: number | null;
}

export type AllergenId =
  | 'trigo'
  | 'centeio'
  | 'cevada'
  | 'aveia'
  | 'estirpes_hibridizadas'
  | 'crustaceos'
  | 'ovos'
  | 'peixes'
  | 'amendoim'
  | 'soja'
  | 'leite'
  | 'amendoa'
  | 'avela'
  | 'castanha_de_caju'
  | 'castanha_do_brasil'
  | 'macadamia'
  | 'nozes'
  | 'peca'
  | 'pistache'
  | 'pinoli'
  | 'castanhas'
  | 'latex_natural';

export type AllergenPresence = 'contains' | 'derivatives';

export interface IngredientAllergenDeclaration {
  allergenId: AllergenId;
  presence: AllergenPresence;
}

export type GlutenStatus = 'unconfirmed' | 'contains' | 'does_not_contain';

export interface Ingredient {
  id: string;
  name: string;
  labelName?: string; // Nome editável como deve sair na lista de ingredientes do rótulo
  isAdditive?: boolean; // Indica aditivo alimentar (exibe função + nome)
  additiveFunction?: string; // Função do aditivo (ex.: "fermento químico", "conservador")
  grams: number;
  nutritionPer100g: NutritionValues;
  tacoId?: string | null;
  tacoName?: string;
  allergens?: string[];
  allergenDeclarations?: IngredientAllergenDeclaration[];
  containsGluten?: boolean;
  source?: 'taco' | 'manual' | 'gemini_ai' | 'taco_local';
  isAddedSugar?: boolean;
}

export type FrontalProductCategory =
  | 'geral'
  | 'leite'
  | 'leite_em_po'
  | 'azeite_oleo'
  | 'sal'
  | 'formulas_infantis_enterais'
  | 'controle_peso'
  | 'suplementos'
  | 'bebidas_alcoolicas'
  | 'uso_industrial_food_service'
  | 'aditivos_coadjuvantes'
  | 'frutas'
  | 'hortalicas'
  | 'leguminosas'
  | 'tuberculos'
  | 'cereais'
  | 'castanhas'
  | 'sementes'
  | 'cogumelos'
  | 'farinhas'
  | 'carnes_pescados'
  | 'ovos'
  | 'leites_fermentados'
  | 'queijos';

export interface Recipe {
  id: string;
  name: string;
  description?: string;
  category: string;
  isLiquid: boolean; // false = g, true = ml
  density?: number; // g/ml para produtos líquidos (padrão 1)
  netWeight?: number; // conteúdo líquido da embalagem (g ou ml)
  panelArea?: number; // área do painel principal em cm² (Anexo XVII)
  productCategory?: FrontalProductCategory; // categoria para exceções da Lupa (Anexo XVI)
  hasAddedCriticalIngredients?: boolean; // se houve adição de açúcar, gordura saturada ou sódio
  portionSize: number; // e.g. 60g or 200ml
  householdMeasure: string; // e.g. "1 fatia", "3 colheres de sopa", "1 xícara"
  servingsPerPackage: number | string; // e.g. 10 ou "cerca de 10"
  readyWeightGrams?: number; // optional cooked/finished product weight
  ingredients: Ingredient[];
  declaredAllergens?: string[];
  mayContainAllergens?: AllergenId[]; // contaminação cruzada ("ALÉRGICOS: PODE CONTER ...")
  containsGluten?: boolean;
  glutenStatus?: GlutenStatus; // confirmação explícita obrigatória quando não houver cereais com glúten
  containsLactose?: boolean; // "CONTÉM LACTOSE" (RDC 136/2017)
  exportTermsAccepted?: boolean; // Aceite do termo de responsabilidade antes da primeira exportação
  exportTermsAcceptedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NutritionTableRow {
  key: keyof NumericNutritionValues;
  label: string;
  shortLabel: string;
  per100: string;
  perPortion: string;
  vd: string;
  indentLevel: 0 | 1 | 2;
  bold: boolean;
  strongBottomBorder?: boolean;
  unitSuffix: 'kcal' | 'g' | 'mg';
}

export interface CalculatedNutrition {
  totalsRecipe: NumericNutritionValues;
  per100g: NumericNutritionValues;
  perPortion: NumericNutritionValues;
  formattedPer100g: Record<keyof NumericNutritionValues, string>;
  formattedPerPortion: Record<keyof NumericNutritionValues, string>;
  tableRows: NutritionTableRow[];
  percentDailyValue: {
    energyKcal: number;
    carbohydrates: number;
    totalSugars: null; // ANVISA Anexo II não define VDR para açúcares totais
    addedSugars: number;
    proteins: number;
    totalFat: number;
    saturatedFat: number;
    // VERIFICAR no modelo de tabela da IN 75 se essa célula é exibida
    transFat: number;
    dietaryFiber: number;
    sodium: number;
  };
  frontalWarnings: {
    highAddedSugar: boolean;
    highSaturatedFat: boolean;
    highSodium: boolean;
  };
  rawFrontalWarnings: {
    highAddedSugar: boolean;
    highSaturatedFat: boolean;
    highSodium: boolean;
  };
  frontalExemption: {
    isExempt: boolean;
    reason: string | null;
    ruleType: 'none' | 'always' | 'no_added_critical_ingredients';
  };
  allergenStatements: {
    containsSentence: string | null;
    mayContainSentence: string | null;
    hasAnyMilkAllergen: boolean;
    hasGlutenCereal: boolean;
  };
  glutenResolution: {
    effectiveStatus: GlutenStatus;
    hasGlutenCereal: boolean;
    statement: 'CONTÉM GLÚTEN' | 'NÃO CONTÉM GLÚTEN' | null;
    requiresConfirmation: boolean;
  };
  containsLactose: boolean;
  totalPreparedWeight: number;
  detectedAllergens: string[];
  detectedGluten: boolean;
}

export type LabelFormat = 'vertical' | 'vertical_broken' | 'horizontal' | 'linear';
