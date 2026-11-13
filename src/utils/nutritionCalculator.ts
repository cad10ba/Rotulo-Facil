/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Recipe,
  CalculatedNutrition,
  NumericNutritionValues,
  NutritionTableRow,
  Ingredient,
  TacoSearchItem,
} from '../types/nutrition';
import {
  ANVISA_ENERGY_FACTORS,
  ANVISA_FRONTAL_LIMITS,
  ANVISA_INSIGNIFICANT_LIMITS,
  ANVISA_ROUNDING_THRESHOLDS,
  ANVISA_SERVINGS_RULES,
  ANVISA_VDR,
  CARB_SUBTRACT_FIBER,
  evaluateFrontalExemption,
} from './anvisaRules';
import {
  buildAllergenStatements,
  getAllergenDef,
  resolveGlutenStatus,
  suggestAllergensFromIngredientName,
} from './allergens';

export { ANVISA_VDR, ANVISA_FRONTAL_LIMITS, CARB_SUBTRACT_FIBER };

// VERIFICAR: Ingredientes cujo campo na TACO seja null (não disponível, "*") ou açúcares totais ainda não informados
// entram com 0 apenas na soma numérica do rótulo, preservando null no ingrediente e exibindo alerta ao usuário.
const NULL_NUTRIENT_SUM_VALUE = 0;

export function createEmptyNutrition(): NumericNutritionValues {
  return {
    energyKcal: 0,
    carbohydrates: 0,
    totalSugars: 0,
    addedSugars: 0,
    proteins: 0,
    totalFat: 0,
    saturatedFat: 0,
    transFat: 0,
    dietaryFiber: 0,
    sodium: 0,
  };
}

/**
 * Arredondamento "meio para cima" (half-up) sem erro de ponto flutuante,
 * operando sobre dígitos decimais e inteiros.
 */
function roundHalfUpScaledInt(value: number, decimals: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const fixed = value.toFixed(10);
  const [intStr, fracStr = ''] = fixed.split('.');
  const paddedFrac = fracStr.padEnd(decimals + 1, '0');
  const keptStr = intStr + paddedFrac.slice(0, decimals);
  const nextDigit = Number(paddedFrac[decimals] ?? '0');

  let scaledInt = parseInt(keptStr, 10);
  if (nextDigit >= 5) {
    scaledInt += 1;
  }
  return scaledInt;
}

export function roundHalfUp(value: number, decimals: number): number {
  const scaled = roundHalfUpScaledInt(value, decimals);
  return scaled / Math.pow(10, decimals);
}

/**
 * Aplica o arredondamento oficial do Anexo III da IN 75/2020:
 * - >= 10: inteiro pela primeira decimal (sem casas decimais)
 * - >= 1 e < 10: 1 casa decimal pela segunda decimal (se resultar .0, mostra como inteiro)
 * - < 1 em gramas (ou kcal): 1 casa decimal pela segunda decimal (mostra 1 casa decimal; se cruzar para 1,0 mostra "1")
 * - < 1 em mg: 2 casas pela terceira decimal (se a segunda decimal for 0, 1 casa decimal; senão 2)
 * - Vírgula como separador decimal.
 */
export function roundAndFormatAnvisa(
  value: number,
  unit: 'kcal' | 'g' | 'mg'
): { numeric: number; formatted: string } {
  if (!Number.isFinite(value) || value <= 0) {
    return { numeric: 0, formatted: '0' };
  }

  if (value >= ANVISA_ROUNDING_THRESHOLDS.integerThreshold) {
    const intVal = roundHalfUpScaledInt(value, 0);
    return { numeric: intVal, formatted: String(intVal) };
  }

  if (value >= ANVISA_ROUNDING_THRESHOLDS.oneDecimalThreshold) {
    const tenths = roundHalfUpScaledInt(value, 1);
    const intPart = Math.floor(tenths / 10);
    const decPart = tenths % 10;
    const formatted = decPart === 0 ? String(intPart) : `${intPart},${decPart}`;
    return { numeric: tenths / 10, formatted };
  }

  // Valores menores que 1 (0 < value < 1)
  if (unit === 'mg') {
    const hundredths = roundHalfUpScaledInt(value, 2);
    const intPart = Math.floor(hundredths / 100);
    const dec1 = Math.floor((hundredths % 100) / 10);
    const dec2 = hundredths % 10;

    let formatted: string;
    if (intPart >= 1 && dec1 === 0 && dec2 === 0) {
      formatted = String(intPart);
    } else if (dec2 === 0) {
      formatted = `${intPart},${dec1}`;
    } else {
      formatted = `${intPart},${dec1}${dec2}`;
    }

    return { numeric: hundredths / 100, formatted };
  }

  // Valores < 1 em gramas (ou kcal)
  const tenths = roundHalfUpScaledInt(value, 1);
  const intPart = Math.floor(tenths / 10);
  const decPart = tenths % 10;
  // Se o arredondamento cruzar para 1,0 (ex: 0,96 -> 1), omite ,0 conforme Anexo III;
  // caso permaneça < 1 (ex: 0,04 -> 0,0 e 0,45 -> 0,5), exibe 1 casa decimal.
  const formatted =
    intPart >= 1 && decPart === 0 ? String(intPart) : `${intPart},${decPart}`;
  return { numeric: tenths / 10, formatted };
}

export function formatAnvisaValue(
  value: number,
  type: 'energy' | 'gram' | 'trans' | 'sodium' | 'percent'
): string {
  if (!Number.isFinite(value) || value === undefined || value === null) {
    return '0';
  }
  if (type === 'percent') {
    return String(roundHalfUpScaledInt(value, 0));
  }
  if (type === 'energy') {
    return roundAndFormatAnvisa(value, 'kcal').formatted;
  }
  if (type === 'sodium') {
    return roundAndFormatAnvisa(value, 'mg').formatted;
  }
  return roundAndFormatAnvisa(value, 'g').formatted;
}

/**
 * IN 75/2020 – Anexo VI: Calcula número de porções por embalagem a partir de netWeight e portionSize.
 * - Se o resultado for inteiro: retorna o número inteiro (ex: "10")
 * - Se não for inteiro e > 2: retorna "cerca de N", arredondado pela primeira decimal
 * - Se não for inteiro e <= 2: retorna com 1 casa decimal e vírgula (// VERIFICAR Anexo VI IN 75/2020)
 */
export function calculateServingsPerPackage(netWeight: number, portionSize: number): string {
  if (!Number.isFinite(netWeight) || !Number.isFinite(portionSize) || netWeight <= 0 || portionSize <= 0) {
    return '';
  }

  const ratio = netWeight / portionSize;
  const roundedInt = Math.round(ratio);
  if (Math.abs(ratio - roundedInt) < 1e-9) {
    return String(roundedInt);
  }

  if (ratio > ANVISA_SERVINGS_RULES.approxThreshold) {
    const approx = roundHalfUpScaledInt(ratio, 0);
    return `cerca de ${approx}`;
  }

  // VERIFICAR (Anexo VI IN 75/2020): para relação não inteira <= 2, declara com 1 casa decimal ou inteiro se .0
  const tenths = roundHalfUpScaledInt(ratio, 1);
  const intPart = Math.floor(tenths / 10);
  const decPart = tenths % 10;
  return decPart === 0 ? String(intPart) : `${intPart},${decPart}`;
}

export function isSugarAddedIngredientName(name: string): boolean {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\b(acucar|acucares|mel|melado|melaco|xarope|glucose|sacarose|frutose|dextrose|rapadura|invertido|caldo de cana|caramelo)\b/i.test(
    normalized
  );
}

export function inferAllergensAndGlutenFromName(name: string): {
  allergens: string[];
  containsGluten: boolean;
} {
  const declarations = suggestAllergensFromIngredientName(name);
  const containsGluten = declarations.some(
    (d) => Boolean(getAllergenDef(d.allergenId)?.triggersGluten)
  );
  return {
    allergens: declarations.map((d) => d.allergenId),
    containsGluten,
  };
}

export function tacoItemToIngredient(
  tacoItem: TacoSearchItem,
  grams: number,
  options?: { existingId?: string; displayName?: string }
): Ingredient {
  const isSugar = isSugarAddedIngredientName(tacoItem.nome);
  const carbs = tacoItem.carboidratos;
  const allergenDeclarations = suggestAllergensFromIngredientName(tacoItem.nome);
  const containsGluten = allergenDeclarations.some(
    (d) => Boolean(getAllergenDef(d.allergenId)?.triggersGluten)
  );

  const friendlyName =
    options?.displayName?.trim() || tacoItem.nome.replace(/,\s*/g, ' ').trim();

  return {
    id: options?.existingId || `ing-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: friendlyName,
    labelName: friendlyName.toLowerCase(),
    grams,
    nutritionPer100g: {
      energyKcal: tacoItem.energiaKcal,
      energyKj: tacoItem.energiaKj,
      carbohydrates: carbs,
      totalSugars: isSugar ? carbs : null,
      addedSugars: isSugar ? carbs : 0,
      proteins: tacoItem.proteinas,
      totalFat: tacoItem.lipideos,
      saturatedFat: tacoItem.gorduraSaturada,
      transFat: tacoItem.gorduraTrans,
      dietaryFiber: tacoItem.fibra,
      sodium: tacoItem.sodio,
    },
    tacoId: tacoItem.tacoId,
    tacoName: tacoItem.nome,
    allergens: allergenDeclarations.map((d) => d.allergenId),
    allergenDeclarations,
    containsGluten,
    source: 'taco',
    isAddedSugar: isSugar,
  };
}

const NUTRIENT_UNITS: Record<keyof NumericNutritionValues, 'kcal' | 'g' | 'mg'> = {
  energyKcal: 'kcal',
  carbohydrates: 'g',
  totalSugars: 'g',
  addedSugars: 'g',
  proteins: 'g',
  totalFat: 'g',
  saturatedFat: 'g',
  transFat: 'g',
  dietaryFiber: 'g',
  sodium: 'mg',
};

function computeEnergyFromNutrients(n: NumericNutritionValues): number {
  return (
    n.carbohydrates * ANVISA_ENERGY_FACTORS.carbohydrates +
    n.proteins * ANVISA_ENERGY_FACTORS.proteins +
    n.totalFat * ANVISA_ENERGY_FACTORS.totalFat +
    n.dietaryFiber * ANVISA_ENERGY_FACTORS.dietaryFiber
  );
}

export function calculateRecipeNutrition(recipe: Recipe): CalculatedNutrition {
  const totalsRecipe = createEmptyNutrition();

  let totalRawWeight = 0;
  const allergenSet = new Set<string>();
  let hasGluten = false;

  recipe.ingredients.forEach((item) => {
    const factor = item.grams / 100;
    totalRawWeight += item.grams;

    const rawCarbs = item.nutritionPer100g.carbohydrates ?? NULL_NUTRIENT_SUM_VALUE;
    const rawFiber = item.nutritionPer100g.dietaryFiber ?? NULL_NUTRIENT_SUM_VALUE;
    const availableCarbs = CARB_SUBTRACT_FIBER
      ? Math.max(0, rawCarbs - rawFiber)
      : rawCarbs;

    totalsRecipe.carbohydrates += availableCarbs * factor;
    totalsRecipe.totalSugars +=
      (item.nutritionPer100g.totalSugars ?? NULL_NUTRIENT_SUM_VALUE) * factor;
    totalsRecipe.addedSugars +=
      (item.nutritionPer100g.addedSugars ?? NULL_NUTRIENT_SUM_VALUE) * factor;
    totalsRecipe.proteins +=
      (item.nutritionPer100g.proteins ?? NULL_NUTRIENT_SUM_VALUE) * factor;
    totalsRecipe.totalFat +=
      (item.nutritionPer100g.totalFat ?? NULL_NUTRIENT_SUM_VALUE) * factor;
    totalsRecipe.saturatedFat +=
      (item.nutritionPer100g.saturatedFat ?? NULL_NUTRIENT_SUM_VALUE) * factor;
    totalsRecipe.transFat +=
      (item.nutritionPer100g.transFat ?? NULL_NUTRIENT_SUM_VALUE) * factor;
    totalsRecipe.dietaryFiber += rawFiber * factor;
    totalsRecipe.sodium +=
      (item.nutritionPer100g.sodium ?? NULL_NUTRIENT_SUM_VALUE) * factor;

    if (item.containsGluten) {
      hasGluten = true;
    }
    if (item.allergens && Array.isArray(item.allergens)) {
      item.allergens.forEach((a) => allergenSet.add(a.toLowerCase().trim()));
    }
  });

  // Energia total da receita calculada pelos nutrientes (IN 75/2020 Anexo XXII)
  totalsRecipe.energyKcal = computeEnergyFromNutrients(totalsRecipe);

  // Peso do produto pronto (usa readyWeightGrams se informado)
  const preparedWeight =
    recipe.readyWeightGrams && recipe.readyWeightGrams > 0
      ? recipe.readyWeightGrams
      : totalRawWeight > 0
        ? totalRawWeight
        : 100;

  const density =
    recipe.isLiquid && recipe.density && recipe.density > 0
      ? recipe.density
      : ANVISA_SERVINGS_RULES.defaultDensity;
  const portionSize = recipe.portionSize > 0 ? recipe.portionSize : 100;

  // Passo 1: Valores brutos por 100 g ou 100 ml (para líquidos: valor por 100 g × densidade)
  const rawPer100 = createEmptyNutrition();
  const scale100 = (100 / preparedWeight) * (recipe.isLiquid ? density : 1);

  rawPer100.carbohydrates = totalsRecipe.carbohydrates * scale100;
  rawPer100.totalSugars = totalsRecipe.totalSugars * scale100;
  rawPer100.addedSugars = totalsRecipe.addedSugars * scale100;
  rawPer100.proteins = totalsRecipe.proteins * scale100;
  rawPer100.totalFat = totalsRecipe.totalFat * scale100;
  rawPer100.saturatedFat = totalsRecipe.saturatedFat * scale100;
  rawPer100.transFat = totalsRecipe.transFat * scale100;
  rawPer100.dietaryFiber = totalsRecipe.dietaryFiber * scale100;
  rawPer100.sodium = totalsRecipe.sodium * scale100;
  rawPer100.energyKcal = computeEnergyFromNutrients(rawPer100);

  // Passo 4 (pré-arredondamento para avaliação conjunta do Anexo IV):
  // Para líquidos, porção (ml) × densidade (g/ml) equivale a rawPer100ml × (portionSize / 100).
  const rawPortion = createEmptyNutrition();
  const scalePortion = portionSize / 100;

  rawPortion.carbohydrates = rawPer100.carbohydrates * scalePortion;
  rawPortion.totalSugars = rawPer100.totalSugars * scalePortion;
  rawPortion.addedSugars = rawPer100.addedSugars * scalePortion;
  rawPortion.proteins = rawPer100.proteins * scalePortion;
  rawPortion.totalFat = rawPer100.totalFat * scalePortion;
  rawPortion.saturatedFat = rawPer100.saturatedFat * scalePortion;
  rawPortion.transFat = rawPer100.transFat * scalePortion;
  rawPortion.dietaryFiber = rawPer100.dietaryFiber * scalePortion;
  rawPortion.sodium = rawPer100.sodium * scalePortion;
  rawPortion.energyKcal = computeEnergyFromNutrients(rawPortion);

  // Passos 2 e 5: Quantidades não significativas (IN 75/2020 Anexo IV)
  // Só declara 0 quando o valor for <= ao limite TANTO por 100 g/ml QUANTO na porção.
  const insigSatFat =
    rawPer100.saturatedFat <= ANVISA_INSIGNIFICANT_LIMITS.saturatedFat &&
    rawPortion.saturatedFat <= ANVISA_INSIGNIFICANT_LIMITS.saturatedFat;

  const insigTransFat =
    rawPer100.transFat <= ANVISA_INSIGNIFICANT_LIMITS.transFat &&
    rawPortion.transFat <= ANVISA_INSIGNIFICANT_LIMITS.transFat;

  const insigTotalFat =
    rawPer100.totalFat <= ANVISA_INSIGNIFICANT_LIMITS.totalFat &&
    rawPortion.totalFat <= ANVISA_INSIGNIFICANT_LIMITS.totalFat &&
    insigSatFat &&
    insigTransFat;

  const hasAddedSugars = rawPer100.addedSugars > 0 || rawPortion.addedSugars > 0;
  const insigTotalSugars =
    rawPer100.totalSugars <= ANVISA_INSIGNIFICANT_LIMITS.totalSugars &&
    rawPortion.totalSugars <= ANVISA_INSIGNIFICANT_LIMITS.totalSugars &&
    !hasAddedSugars;

  const insigCarbs =
    rawPer100.carbohydrates <= ANVISA_INSIGNIFICANT_LIMITS.carbohydrates &&
    rawPortion.carbohydrates <= ANVISA_INSIGNIFICANT_LIMITS.carbohydrates &&
    insigTotalSugars;

  const insigProteins =
    rawPer100.proteins <= ANVISA_INSIGNIFICANT_LIMITS.proteins &&
    rawPortion.proteins <= ANVISA_INSIGNIFICANT_LIMITS.proteins;

  const insigFiber =
    rawPer100.dietaryFiber <= ANVISA_INSIGNIFICANT_LIMITS.dietaryFiber &&
    rawPortion.dietaryFiber <= ANVISA_INSIGNIFICANT_LIMITS.dietaryFiber;

  const insigSodium =
    rawPer100.sodium <= ANVISA_INSIGNIFICANT_LIMITS.sodium &&
    rawPortion.sodium <= ANVISA_INSIGNIFICANT_LIMITS.sodium;

  const insigEnergy =
    rawPer100.energyKcal <= ANVISA_INSIGNIFICANT_LIMITS.energyKcal &&
    rawPortion.energyKcal <= ANVISA_INSIGNIFICANT_LIMITS.energyKcal;

  const insignificantMap: Record<keyof NumericNutritionValues, boolean> = {
    energyKcal: insigEnergy,
    carbohydrates: insigCarbs,
    totalSugars: insigTotalSugars,
    addedSugars: !hasAddedSugars,
    proteins: insigProteins,
    totalFat: insigTotalFat,
    saturatedFat: insigSatFat,
    transFat: insigTransFat,
    dietaryFiber: insigFiber,
    sodium: insigSodium,
  };

  // Passos 3 e 5: Arredondamento oficial (IN 75/2020 Anexo III)
  const per100g = createEmptyNutrition();
  const perPortion = createEmptyNutrition();
  const formattedPer100g = {} as Record<keyof NumericNutritionValues, string>;
  const formattedPerPortion = {} as Record<keyof NumericNutritionValues, string>;

  (Object.keys(NUTRIENT_UNITS) as Array<keyof NumericNutritionValues>).forEach((key) => {
    const unit = NUTRIENT_UNITS[key];
    if (insignificantMap[key]) {
      per100g[key] = 0;
      perPortion[key] = 0;
      formattedPer100g[key] = '0';
      formattedPerPortion[key] = '0';
    } else {
      const r100 = roundAndFormatAnvisa(rawPer100[key], unit);
      const rPortion = roundAndFormatAnvisa(rawPortion[key], unit);
      per100g[key] = r100.numeric;
      perPortion[key] = rPortion.numeric;
      formattedPer100g[key] = r100.formatted;
      formattedPerPortion[key] = rPortion.formatted;
    }
  });

  // Passo 6: %VD calculado a partir do valor da porção JÁ ARREDONDADO (IN 75/2020 Anexo II)
  const percentDailyValue = {
    energyKcal: roundHalfUpScaledInt((perPortion.energyKcal / ANVISA_VDR.energyKcal) * 100, 0),
    carbohydrates: roundHalfUpScaledInt((perPortion.carbohydrates / ANVISA_VDR.carbohydrates) * 100, 0),
    totalSugars: null, // Anexo II não define VDR para açúcares totais
    addedSugars: roundHalfUpScaledInt((perPortion.addedSugars / ANVISA_VDR.addedSugars) * 100, 0),
    proteins: roundHalfUpScaledInt((perPortion.proteins / ANVISA_VDR.proteins) * 100, 0),
    totalFat: roundHalfUpScaledInt((perPortion.totalFat / ANVISA_VDR.totalFat) * 100, 0),
    saturatedFat: roundHalfUpScaledInt((perPortion.saturatedFat / ANVISA_VDR.saturatedFat) * 100, 0),
    // VERIFICAR no modelo de tabela da IN 75 se essa célula é exibida
    transFat: roundHalfUpScaledInt((perPortion.transFat / ANVISA_VDR.transFat) * 100, 0),
    dietaryFiber: roundHalfUpScaledInt((perPortion.dietaryFiber / ANVISA_VDR.dietaryFiber) * 100, 0),
    sodium: roundHalfUpScaledInt((perPortion.sodium / ANVISA_VDR.sodium) * 100, 0),
  };

  // Rotulagem Nutricional Frontal (Anexo XV): sempre avaliada sobre os valores por 100 g/ml
  const limits = recipe.isLiquid ? ANVISA_FRONTAL_LIMITS.liquid : ANVISA_FRONTAL_LIMITS.solid;
  const rawFrontalWarnings = {
    highAddedSugar: per100g.addedSugars >= limits.addedSugar,
    highSaturatedFat: per100g.saturatedFat >= limits.saturatedFat,
    highSodium: per100g.sodium >= limits.sodium,
  };

  // Exceções à Rotulagem Nutricional Frontal (Anexo XVI / RDC 429/2020)
  const frontalExemption = evaluateFrontalExemption(
    recipe.productCategory,
    recipe.hasAddedCriticalIngredients
  );

  const frontalWarnings = frontalExemption.isExempt
    ? { highAddedSugar: false, highSaturatedFat: false, highSodium: false }
    : rawFrontalWarnings;

  const detectedAllergens = Array.from(allergenSet);
  const allergenStatements = buildAllergenStatements(recipe);
  const glutenResolution = resolveGlutenStatus(recipe);
  const containsLactose = Boolean(recipe.containsLactose);

  const tableRows: NutritionTableRow[] = [
    {
      key: 'energyKcal',
      label: 'Valor energético (kcal)',
      shortLabel: 'Valor energ.',
      per100: formattedPer100g.energyKcal,
      perPortion: formattedPerPortion.energyKcal,
      vd: String(percentDailyValue.energyKcal),
      indentLevel: 0,
      bold: true,
      strongBottomBorder: true,
      unitSuffix: 'kcal',
    },
    {
      key: 'carbohydrates',
      label: 'Carboidratos (g)',
      shortLabel: 'Carboidratos',
      per100: formattedPer100g.carbohydrates,
      perPortion: formattedPerPortion.carbohydrates,
      vd: String(percentDailyValue.carbohydrates),
      indentLevel: 0,
      bold: true,
      unitSuffix: 'g',
    },
    {
      key: 'totalSugars',
      label: 'Açúcares totais (g)',
      shortLabel: 'Açúc. tot.',
      per100: formattedPer100g.totalSugars,
      perPortion: formattedPerPortion.totalSugars,
      vd: '-',
      indentLevel: 1,
      bold: false,
      unitSuffix: 'g',
    },
    {
      key: 'addedSugars',
      label: 'Açúcares adicionados (g)',
      shortLabel: 'Açúc. adic.',
      per100: formattedPer100g.addedSugars,
      perPortion: formattedPerPortion.addedSugars,
      vd: String(percentDailyValue.addedSugars),
      indentLevel: 2,
      bold: false,
      unitSuffix: 'g',
    },
    {
      key: 'proteins',
      label: 'Proteínas (g)',
      shortLabel: 'Proteínas',
      per100: formattedPer100g.proteins,
      perPortion: formattedPerPortion.proteins,
      vd: String(percentDailyValue.proteins),
      indentLevel: 0,
      bold: true,
      unitSuffix: 'g',
    },
    {
      key: 'totalFat',
      label: 'Gorduras totais (g)',
      shortLabel: 'Gord. tot.',
      per100: formattedPer100g.totalFat,
      perPortion: formattedPerPortion.totalFat,
      vd: String(percentDailyValue.totalFat),
      indentLevel: 0,
      bold: true,
      unitSuffix: 'g',
    },
    {
      key: 'saturatedFat',
      label: 'Gorduras saturadas (g)',
      shortLabel: 'Gord. sat.',
      per100: formattedPer100g.saturatedFat,
      perPortion: formattedPerPortion.saturatedFat,
      vd: String(percentDailyValue.saturatedFat),
      indentLevel: 1,
      bold: false,
      unitSuffix: 'g',
    },
    {
      key: 'transFat',
      label: 'Gorduras trans (g)',
      shortLabel: 'Gord. trans',
      per100: formattedPer100g.transFat,
      perPortion: formattedPerPortion.transFat,
      // VERIFICAR no modelo de tabela da IN 75 se essa célula é exibida
      vd: String(percentDailyValue.transFat),
      indentLevel: 1,
      bold: false,
      unitSuffix: 'g',
    },
    {
      key: 'dietaryFiber',
      label: 'Fibra alimentar (g)',
      shortLabel: 'Fibra alim.',
      per100: formattedPer100g.dietaryFiber,
      perPortion: formattedPerPortion.dietaryFiber,
      vd: String(percentDailyValue.dietaryFiber),
      indentLevel: 0,
      bold: true,
      unitSuffix: 'g',
    },
    {
      key: 'sodium',
      label: 'Sódio (mg)',
      shortLabel: 'Sódio',
      per100: formattedPer100g.sodium,
      perPortion: formattedPerPortion.sodium,
      vd: String(percentDailyValue.sodium),
      indentLevel: 0,
      bold: true,
      unitSuffix: 'mg',
    },
  ];

  return {
    totalsRecipe,
    per100g,
    perPortion,
    formattedPer100g,
    formattedPerPortion,
    tableRows,
    percentDailyValue,
    frontalWarnings,
    rawFrontalWarnings,
    frontalExemption,
    allergenStatements,
    glutenResolution,
    containsLactose,
    totalPreparedWeight: preparedWeight,
    detectedAllergens,
    detectedGluten: glutenResolution.effectiveStatus === 'contains',
  };
}
