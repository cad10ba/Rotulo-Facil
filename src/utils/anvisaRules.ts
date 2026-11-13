/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Constantes regulatórias oficiais da ANVISA:
 * - RDC nº 429/2020 (Rotulagem Nutricional de Alimentos Embalados)
 * - IN nº 75/2020 (Requisitos Técnicos para Declaração da Rotulagem Nutricional)
 */

/**
 * IN 75/2020 – Anexo XXII: Fatores de conversão para cálculo do valor energético.
 */
export const ANVISA_ENERGY_FACTORS = {
  carbohydrates: 4, // kcal/g (exceto polióis) – IN 75/2020 Anexo XXII
  proteins: 4, // kcal/g – IN 75/2020 Anexo XXII
  totalFat: 9, // kcal/g – IN 75/2020 Anexo XXII
  // VERIFICAR com nutricionista: Anexo XXII da IN 75/2020 prevê 2 kcal/g apenas para fibra solúvel,
  // e a Tabela TACO não separa fibra solúvel de insolúvel.
  dietaryFiber: 0,
} as const;

/**
 * VERIFICAR: A Tabela TACO calcula carboidrato total por diferença incluindo a fibra alimentar.
 * Quando true, subtrai a fibra alimentar do carboidrato total para obter carboidratos disponíveis
 * declarados e utilizados no cálculo energético (IN 75/2020 Anexo XXII).
 */
export const CARB_SUBTRACT_FIBER = true;

/**
 * IN 75/2020 – Anexo II: Valores Diários de Referência (VDR) para dieta de 2.000 kcal.
 * Açúcares totais não possuem VDR estabelecido no Anexo II.
 */
export const ANVISA_VDR = {
  energyKcal: 2000, // IN 75/2020 Anexo II
  carbohydrates: 300, // g – IN 75/2020 Anexo II
  addedSugars: 50, // g – IN 75/2020 Anexo II
  proteins: 50, // g – IN 75/2020 Anexo II
  totalFat: 65, // g – IN 75/2020 Anexo II
  saturatedFat: 20, // g – IN 75/2020 Anexo II
  // VERIFICAR no modelo de tabela da IN 75 se essa célula é exibida
  transFat: 2, // g – IN 75/2020 Anexo II
  dietaryFiber: 25, // g – IN 75/2020 Anexo II
  sodium: 2000, // mg – IN 75/2020 Anexo II
} as const;

/**
 * IN 75/2020 – Anexo IV: Critérios para quantidades não significativas.
 * O valor deve ser declarado como 0 somente quando for <= ao limite
 * TANTO por 100 g/ml QUANTO na porção.
 */
export const ANVISA_INSIGNIFICANT_LIMITS = {
  energyKcal: 4, // <= 4 kcal – IN 75/2020 Anexo IV
  carbohydrates: 0.5, // <= 0,5 g (e só se açúcares totais também forem não significativos) – IN 75/2020 Anexo IV
  // VERIFICAR (Anexo IV IN 75/2020): "não houver açúcares adicionados" tratado como addedSugars === 0 em 100 g/ml e na porção.
  totalSugars: 0.5, // <= 0,5 g (e só se não houver açúcares adicionados) – IN 75/2020 Anexo IV
  proteins: 0.5, // <= 0,5 g – IN 75/2020 Anexo IV
  totalFat: 0.5, // <= 0,5 g (e só se saturadas e trans também forem não significativas) – IN 75/2020 Anexo IV
  saturatedFat: 0.1, // <= 0,1 g – IN 75/2020 Anexo IV
  transFat: 0.1, // <= 0,1 g – IN 75/2020 Anexo IV
  dietaryFiber: 0.5, // <= 0,5 g – IN 75/2020 Anexo IV
  sodium: 5, // <= 5 mg – IN 75/2020 Anexo IV
} as const;

/**
 * IN 75/2020 – Anexo III: Limiares de magnitude para regras de arredondamento.
 */
export const ANVISA_ROUNDING_THRESHOLDS = {
  integerThreshold: 10, // >= 10: inteiro (sem casas decimais) – IN 75/2020 Anexo III
  oneDecimalThreshold: 1, // >= 1 e < 10: 1 casa decimal (omite ,0 se inteiro) – IN 75/2020 Anexo III
} as const;

/**
 * IN 75/2020 – Anexo VI: Limiar para declaração aproximada de porções ("cerca de N").
 */
export const ANVISA_SERVINGS_RULES = {
  approxThreshold: 2, // Se não inteiro e > 2: "cerca de N" arredondado pela 1ª decimal – IN 75/2020 Anexo VI
  defaultDensity: 1, // Densidade padrão g/ml quando não informada em líquidos
} as const;

/**
 * IN 75/2020 – Anexo XV: Limites para Rotulagem Nutricional Frontal (Lupa ANVISA).
 * Sempre avaliados sobre os valores por 100 g (sólidos/semissólidos) ou 100 ml (líquidos).
 */
export const ANVISA_FRONTAL_LIMITS = {
  solid: {
    addedSugar: 15, // >= 15 g/100 g – IN 75/2020 Anexo XV
    saturatedFat: 6, // >= 6 g/100 g – IN 75/2020 Anexo XV
    sodium: 600, // >= 600 mg/100 g – IN 75/2020 Anexo XV
  },
  liquid: {
    addedSugar: 7.5, // >= 7,5 g/100 ml – IN 75/2020 Anexo XV
    saturatedFat: 3, // >= 3 g/100 ml – IN 75/2020 Anexo XV
    sodium: 300, // >= 300 mg/100 ml – IN 75/2020 Anexo XV
  },
} as const;

export const ANVISA_DEFAULT_PANEL_AREA_CM2 = 150;

/**
 * IN 75/2020 – Anexo XVII: Tabela de dimensões da Rotulagem Nutricional Frontal
 * conforme a área do painel principal da embalagem (cm²).
 * VERIFICAR com o Anexo XVII da IN 75/2020 os limites exatos de área (cm²),
 * a altura da lupa/blocos (mm) e os tamanhos mínimos de fonte (pt) de cada faixa.
 */
export const ANVISA_LUPA_DIMENSIONS = [
  {
    maxPanelAreaCm2: 40,
    label: 'Até 40 cm²',
    heightMm: 8,
    fontSizePt: 7,
  },
  {
    maxPanelAreaCm2: 100,
    label: '> 40 a 100 cm²',
    heightMm: 10,
    fontSizePt: 8,
  },
  {
    maxPanelAreaCm2: 200,
    label: '> 100 a 200 cm²',
    heightMm: 12,
    fontSizePt: 9.5,
  },
  {
    maxPanelAreaCm2: 350,
    label: '> 200 a 350 cm²',
    heightMm: 14,
    fontSizePt: 11,
  },
  {
    maxPanelAreaCm2: 600,
    label: '> 350 a 600 cm²',
    heightMm: 17,
    fontSizePt: 13,
  },
  {
    maxPanelAreaCm2: 1500,
    label: '> 600 a 1.500 cm²',
    heightMm: 21,
    fontSizePt: 16,
  },
  {
    maxPanelAreaCm2: null,
    label: 'Acima de 1.500 cm²',
    heightMm: 26,
    fontSizePt: 20,
  },
] as const;

export function getFrontalMagnifierDimensions(panelAreaCm2?: number): {
  panelAreaCm2: number;
  label: string;
  heightMm: number;
  fontSizePt: number;
} {
  const safeArea =
    typeof panelAreaCm2 === 'number' && Number.isFinite(panelAreaCm2) && panelAreaCm2 > 0
      ? panelAreaCm2
      : ANVISA_DEFAULT_PANEL_AREA_CM2;

  const matched =
    ANVISA_LUPA_DIMENSIONS.find(
      (tier) => tier.maxPanelAreaCm2 === null || safeArea <= tier.maxPanelAreaCm2
    ) || ANVISA_LUPA_DIMENSIONS[ANVISA_LUPA_DIMENSIONS.length - 1];

  return {
    panelAreaCm2: safeArea,
    label: matched.label,
    heightMm: matched.heightMm,
    fontSizePt: matched.fontSizePt,
  };
}

/**
 * VERIFICAR as condições exatas de cada formato (IN 75/2020, arts. 9º a 15 e Anexos VIII a XI):
 * O formato vertical é o padrão obrigatório; horizontal e linear somente podem ser usados
 * quando não houver espaço suficiente na embalagem para a declaração vertical.
 */
export const ANVISA_TABLE_FORMAT_CONDITIONS_WARNING =
  'Conforme a IN 75/2020, o modelo vertical é o padrão obrigatório. Os formatos horizontal e linear só são permitidos quando não houver espaço disponível no rótulo para o formato vertical.';

export interface TableTypographySpec {
  maxPanelAreaCm2: number | null;
  label: string;
  minFontPt: number;
  maxFontPt: number;
  headerFontPt: number;
  bodyFontPt: number;
  footnoteFontPt: number;
  thinLineMm: number;
  mediumLineMm: number;
  thickLineMm: number;
}

/**
 * IN 75/2020 – Tamanhos mínimo/máximo de fonte (pt) e espessuras de linha (mm)
 * da Tabela de Informação Nutricional por faixa de área do painel principal.
 * // VERIFICAR com a IN 75 os valores exatos de cada faixa de área do painel.
 */
export const ANVISA_TABLE_TYPOGRAPHY_BY_AREA: readonly TableTypographySpec[] = [
  {
    maxPanelAreaCm2: 40,
    label: 'Até 40 cm²',
    minFontPt: 6,
    maxFontPt: 9,
    headerFontPt: 8,
    bodyFontPt: 6.5,
    footnoteFontPt: 6,
    thinLineMm: 0.15,
    mediumLineMm: 0.25,
    thickLineMm: 0.45,
  },
  {
    maxPanelAreaCm2: 100,
    label: '> 40 a 100 cm²',
    minFontPt: 6.5,
    maxFontPt: 10,
    headerFontPt: 9,
    bodyFontPt: 7,
    footnoteFontPt: 6.5,
    thinLineMm: 0.18,
    mediumLineMm: 0.3,
    thickLineMm: 0.55,
  },
  {
    maxPanelAreaCm2: 200,
    label: '> 100 a 200 cm²',
    minFontPt: 8,
    maxFontPt: 12,
    headerFontPt: 10.5,
    bodyFontPt: 8.5,
    footnoteFontPt: 8,
    thinLineMm: 0.2,
    mediumLineMm: 0.35,
    thickLineMm: 0.65,
  },
  {
    maxPanelAreaCm2: 350,
    label: '> 200 a 350 cm²',
    minFontPt: 8,
    maxFontPt: 13,
    headerFontPt: 11,
    bodyFontPt: 9,
    footnoteFontPt: 8,
    thinLineMm: 0.22,
    mediumLineMm: 0.38,
    thickLineMm: 0.7,
  },
  {
    maxPanelAreaCm2: 600,
    label: '> 350 a 600 cm²',
    minFontPt: 8,
    maxFontPt: 14,
    headerFontPt: 12,
    bodyFontPt: 9.5,
    footnoteFontPt: 8,
    thinLineMm: 0.25,
    mediumLineMm: 0.4,
    thickLineMm: 0.75,
  },
  {
    maxPanelAreaCm2: 1500,
    label: '> 600 a 1.500 cm²',
    minFontPt: 9,
    maxFontPt: 16,
    headerFontPt: 13,
    bodyFontPt: 10.5,
    footnoteFontPt: 9,
    thinLineMm: 0.28,
    mediumLineMm: 0.45,
    thickLineMm: 0.85,
  },
  {
    maxPanelAreaCm2: null,
    label: 'Acima de 1.500 cm²',
    minFontPt: 10,
    maxFontPt: 18,
    headerFontPt: 14,
    bodyFontPt: 11.5,
    footnoteFontPt: 10,
    thinLineMm: 0.3,
    mediumLineMm: 0.5,
    thickLineMm: 0.95,
  },
] as const;

export function getTableTypographySpec(
  panelAreaCm2?: number
): TableTypographySpec & { panelAreaCm2: number } {
  const safeArea =
    typeof panelAreaCm2 === 'number' && Number.isFinite(panelAreaCm2) && panelAreaCm2 > 0
      ? panelAreaCm2
      : ANVISA_DEFAULT_PANEL_AREA_CM2;

  const matched =
    ANVISA_TABLE_TYPOGRAPHY_BY_AREA.find(
      (tier) => tier.maxPanelAreaCm2 === null || safeArea <= tier.maxPanelAreaCm2
    ) || ANVISA_TABLE_TYPOGRAPHY_BY_AREA[ANVISA_TABLE_TYPOGRAPHY_BY_AREA.length - 1];

  const clampFont = (pt: number) =>
    Math.min(matched.maxFontPt, Math.max(matched.minFontPt, pt));

  return {
    ...matched,
    panelAreaCm2: safeArea,
    headerFontPt: clampFont(matched.headerFontPt),
    bodyFontPt: clampFont(matched.bodyFontPt),
    footnoteFontPt: clampFont(matched.footnoteFontPt),
  };
}

import type { FrontalProductCategory } from '../types/nutrition';

export interface ProductCategoryRule {
  id: FrontalProductCategory;
  label: string;
  group: 'general' | 'always_exempt' | 'conditional_exempt';
  exemptionReason: string | null;
}

/**
 * IN 75/2020 – Anexo XVI / RDC 429/2020: Exceções à Rotulagem Nutricional Frontal.
 * VERIFICAR com o Anexo XVI da IN 75/2020 e RDC 429/2020 eventuais enquadramentos específicos
 * (ex.: ingredientes característicos do processo versus adição de nutrientes críticos).
 */
export const ANVISA_PRODUCT_CATEGORIES: ProductCategoryRule[] = [
  {
    id: 'geral',
    label: 'Alimento embalado em geral (sujeito à Lupa Frontal)',
    group: 'general',
    exemptionReason: null,
  },
  // Isentos sempre
  {
    id: 'leite',
    label: 'Leites de todas as espécies',
    group: 'always_exempt',
    exemptionReason: 'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): leites de todas as espécies.',
  },
  {
    id: 'leite_em_po',
    label: 'Leite em pó',
    group: 'always_exempt',
    exemptionReason: 'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): leite em pó.',
  },
  {
    id: 'azeite_oleo',
    label: 'Azeite de oliva e óleos vegetais',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): azeite e óleos vegetais.',
  },
  {
    id: 'sal',
    label: 'Sal para consumo humano',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): sal para consumo humano.',
  },
  {
    id: 'formulas_infantis_enterais',
    label: 'Fórmulas infantis e fórmulas para nutrição enteral',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): fórmulas infantis e enterais.',
  },
  {
    id: 'controle_peso',
    label: 'Alimentos para controle de peso',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): alimentos para controle de peso.',
  },
  {
    id: 'suplementos',
    label: 'Suplementos alimentares',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): suplementos alimentares.',
  },
  {
    id: 'bebidas_alcoolicas',
    label: 'Bebidas alcoólicas',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): bebidas alcoólicas.',
  },
  {
    id: 'uso_industrial_food_service',
    label: 'Produtos exclusivamente para uso industrial ou food service',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): uso exclusivamente industrial ou em serviços de alimentação (food service).',
  },
  {
    id: 'aditivos_coadjuvantes',
    label: 'Aditivos alimentares e coadjuvantes de tecnologia',
    group: 'always_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI / RDC 429/2020): aditivos alimentares e coadjuvantes de tecnologia.',
  },
  // Isentos apenas quando NÃO há adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio
  {
    id: 'frutas',
    label: 'Frutas',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): frutas sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'hortalicas',
    label: 'Hortaliças',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): hortaliças sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'leguminosas',
    label: 'Leguminosas',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): leguminosas sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'tuberculos',
    label: 'Tubérculos',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): tubérculos sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'cereais',
    label: 'Cereais',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): cereais sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'castanhas',
    label: 'Castanhas',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): castanhas sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'sementes',
    label: 'Sementes',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): sementes sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'cogumelos',
    label: 'Cogumelos',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): cogumelos sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'farinhas',
    label: 'Farinhas',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): farinhas sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'carnes_pescados',
    label: 'Carnes e pescados frescos, resfriados ou congelados',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): carnes e pescados frescos, resfriados ou congelados sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'ovos',
    label: 'Ovos',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): ovos sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'leites_fermentados',
    label: 'Leites fermentados',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): leites fermentados sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
  {
    id: 'queijos',
    label: 'Queijos',
    group: 'conditional_exempt',
    exemptionReason:
      'Isento de Lupa Frontal (Anexo XVI): queijos sem adição de ingredientes que acrescentem açúcar, gordura saturada ou sódio.',
  },
];

export function evaluateFrontalExemption(
  productCategory?: FrontalProductCategory,
  hasAddedCriticalIngredients?: boolean
): {
  isExempt: boolean;
  reason: string | null;
  ruleType: 'none' | 'always' | 'no_added_critical_ingredients';
} {
  const category = productCategory || 'geral';
  const rule = ANVISA_PRODUCT_CATEGORIES.find((c) => c.id === category);

  if (!rule || rule.group === 'general') {
    return { isExempt: false, reason: null, ruleType: 'none' };
  }

  if (rule.group === 'always_exempt') {
    return {
      isExempt: true,
      reason: rule.exemptionReason,
      ruleType: 'always',
    };
  }

  // Isento apenas quando NÃO há adição de ingredientes que acrescentam açúcar, gordura saturada ou sódio
  if (!hasAddedCriticalIngredients) {
    return {
      isExempt: true,
      reason: rule.exemptionReason,
      ruleType: 'no_added_critical_ingredients',
    };
  }

  return {
    isExempt: false,
    reason: null,
    ruleType: 'none',
  };
}
