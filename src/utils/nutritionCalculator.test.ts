/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  calculateRecipeNutrition,
  calculateServingsPerPackage,
  roundAndFormatAnvisa,
} from './nutritionCalculator';
import {
  CARB_SUBTRACT_FIBER,
  evaluateFrontalExemption,
  getFrontalMagnifierDimensions,
} from './anvisaRules';
import { Ingredient, Recipe } from '../types/nutrition';

function makeIngredient(
  overrides: Partial<Ingredient['nutritionPer100g']> & {
    grams?: number;
    name?: string;
    isAddedSugar?: boolean;
  }
): Ingredient {
  const { grams = 100, name = 'Ingrediente Teste', isAddedSugar = false, ...nutrients } = overrides;
  return {
    id: 'ing-test',
    name,
    grams,
    nutritionPer100g: {
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
      ...nutrients,
    },
    tacoId: '1',
    allergens: [],
    containsGluten: false,
    source: 'taco',
    isAddedSugar,
  };
}

function makeRecipe(
  ingredients: Ingredient[],
  overrides: Partial<Recipe> = {}
): Recipe {
  return {
    id: 'recipe-test',
    name: 'Receita Teste',
    category: 'Geral',
    isLiquid: false,
    density: 1,
    portionSize: 100,
    householdMeasure: '1 porção',
    servingsPerPackage: '1',
    ingredients,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('IN 75/2020 Anexo III - Arredondamento oficial', () => {
  it('arredonda valores em gramas e kcal conforme faixas e sem erro de ponto flutuante', () => {
    expect(roundAndFormatAnvisa(0.04, 'g')).toEqual({ numeric: 0, formatted: '0,0' });
    expect(roundAndFormatAnvisa(0.45, 'g')).toEqual({ numeric: 0.5, formatted: '0,5' });
    expect(roundAndFormatAnvisa(0.96, 'g')).toEqual({ numeric: 1, formatted: '1' });
    expect(roundAndFormatAnvisa(1.04, 'g')).toEqual({ numeric: 1, formatted: '1' });
    expect(roundAndFormatAnvisa(3.05, 'g')).toEqual({ numeric: 3.1, formatted: '3,1' });
    expect(roundAndFormatAnvisa(9.96, 'g')).toEqual({ numeric: 10, formatted: '10' });
    expect(roundAndFormatAnvisa(10.5, 'g')).toEqual({ numeric: 11, formatted: '11' });
    expect(roundAndFormatAnvisa(123.4, 'g')).toEqual({ numeric: 123, formatted: '123' });
  });

  it('arredonda sódio (mg) < 1 pela terceira decimal conforme Anexo III', () => {
    expect(roundAndFormatAnvisa(0.104, 'mg')).toEqual({ numeric: 0.1, formatted: '0,1' });
    expect(roundAndFormatAnvisa(0.125, 'mg')).toEqual({ numeric: 0.13, formatted: '0,13' });
    expect(roundAndFormatAnvisa(0.996, 'mg')).toEqual({ numeric: 1, formatted: '1' });
  });
});

describe('IN 75/2020 Anexo IV - Quantidades não significativas', () => {
  it('declara 0 para sódio <= 5 mg e trans <= 0,1 g quando não significativos em 100g e porção', () => {
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        sodium: 4.9,
        transFat: 0.1,
        proteins: 10,
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    expect(result.per100g.sodium).toBe(0);
    expect(result.formattedPer100g.sodium).toBe('0');
    expect(result.perPortion.sodium).toBe(0);
    expect(result.formattedPerPortion.sodium).toBe('0');

    expect(result.per100g.transFat).toBe(0);
    expect(result.formattedPer100g.transFat).toBe('0');
    expect(result.perPortion.transFat).toBe(0);
    expect(result.formattedPerPortion.transFat).toBe('0');
  });

  it('exibe 0,1 quando gorduras trans = 0,11 g (acima do limite de 0,1 g)', () => {
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        totalFat: 2,
        transFat: 0.11,
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    expect(result.per100g.transFat).toBe(0.1);
    expect(result.formattedPer100g.transFat).toBe('0,1');
    expect(result.perPortion.transFat).toBe(0.1);
    expect(result.formattedPerPortion.transFat).toBe('0,1');
  });

  it('NÃO declara 0 quando o nutriente é <= limite em 100g mas > limite na porção', () => {
    const recipe = makeRecipe(
      [
        makeIngredient({
          grams: 300,
          sodium: 4.9, // 4,9 mg/100g <= 5, mas em porção de 200g dá 9,8 mg > 5
        }),
      ],
      { portionSize: 200 }
    );

    const result = calculateRecipeNutrition(recipe);
    expect(result.per100g.sodium).toBe(4.9);
    expect(result.formattedPer100g.sodium).toBe('4,9');
    expect(result.perPortion.sodium).toBe(9.8);
    expect(result.formattedPerPortion.sodium).toBe('9,8');
  });

  it('NÃO declara gorduras totais = 0 se saturadas ou trans forem significativas', () => {
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        totalFat: 0.4,
        saturatedFat: 0.25,
        transFat: 0,
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    expect(result.per100g.totalFat).toBe(0.4);
    expect(result.formattedPer100g.totalFat).toBe('0,4');
    expect(result.per100g.saturatedFat).toBe(0.3);
  });

  it('NÃO declara carboidratos ou açúcares totais = 0 se houver açúcares adicionados', () => {
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        carbohydrates: 0.4,
        totalSugars: 0.4,
        addedSugars: 0.4,
        isAddedSugar: true,
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    expect(result.formattedPer100g.addedSugars).toBe('0,4');
    expect(result.formattedPer100g.totalSugars).toBe('0,4');
    expect(result.formattedPer100g.carbohydrates).toBe('0,4');
  });
});

describe('IN 75/2020 Anexo XXII & Anexo II - Energia, Fibra e %VD após arredondamento', () => {
  it('calcula valor energético a partir dos nutrientes (ignorando kcal da TACO) e subtrai fibra quando CARB_SUBTRACT_FIBER=true', () => {
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        energyKcal: 999, // Deve ser ignorado
        carbohydrates: 50,
        dietaryFiber: 10,
        proteins: 10,
        totalFat: 5,
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    const expectedCarbs = CARB_SUBTRACT_FIBER ? 40 : 50;
    const expectedKcal = expectedCarbs * 4 + 10 * 4 + 5 * 9; // 160 + 40 + 45 = 245

    expect(result.per100g.carbohydrates).toBe(expectedCarbs);
    expect(result.per100g.dietaryFiber).toBe(10);
    expect(result.per100g.energyKcal).toBe(expectedKcal);
  });

  it('calcula %VD a partir do valor da porção já arredondado e mantém açúcares totais sem %VD', () => {
    // 100g com 10,5g proteína -> porção de 100g arredonda para 11g -> %VD = round((11 / 50)*100) = 22%
    // (sem arredondar antes seria round((10.5 / 50)*100) = 21%)
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        proteins: 10.5,
        transFat: 0.4, // 0,4 / 2 * 100 = 20%
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    expect(result.perPortion.proteins).toBe(11);
    expect(result.percentDailyValue.proteins).toBe(22);
    expect(result.percentDailyValue.transFat).toBe(20);
    expect(result.percentDailyValue.totalSugars).toBeNull();
  });
});

describe('Líquidos com densidade, rendimento pronto e porções por embalagem', () => {
  it('converte 100 ml e porção em ml usando a densidade em produtos líquidos', () => {
    // Produto com 10g de carboidrato em 100g e densidade 1,03 g/ml
    // Em 100 ml = 10 * 1,03 = 10,3g -> arredonda (>=10) para 10g
    // Em porção de 200 ml = 20,6g -> arredonda (>=10) para 21g
    const recipe = makeRecipe(
      [
        makeIngredient({
          grams: 100,
          carbohydrates: 10,
          addedSugars: 7.3,
          totalSugars: 7.3,
        }),
      ],
      {
        isLiquid: true,
        density: 1.03,
        portionSize: 200,
      }
    );

    const result = calculateRecipeNutrition(recipe);
    expect(result.per100g.carbohydrates).toBe(10); // 10.3 -> 10
    expect(result.perPortion.carbohydrates).toBe(21); // 20.6 -> 21
    // addedSugars = 7.3 * 1.03 = 7.519 -> 7.5 g/100ml >= 7.5 (Lupa líquido!)
    expect(result.per100g.addedSugars).toBe(7.5);
    expect(result.frontalWarnings.highAddedSugar).toBe(true);
  });

  it('concentra nutrientes quando readyWeightGrams é menor que o peso bruto dos ingredientes', () => {
    // 200g de massa bruta com 50g de proteína total -> assa e fica com 100g prontos
    // Logo por 100g prontos tem 50g de proteína; porção de 50g tem 25g de proteína
    const recipe = makeRecipe(
      [
        makeIngredient({
          grams: 200,
          proteins: 25, // 25g/100g -> 50g total
        }),
      ],
      {
        readyWeightGrams: 100,
        portionSize: 50,
      }
    );

    const result = calculateRecipeNutrition(recipe);
    expect(result.totalPreparedWeight).toBe(100);
    expect(result.per100g.proteins).toBe(50);
    expect(result.perPortion.proteins).toBe(25);
  });

  it('calcula porções por embalagem conforme Anexo VI', () => {
    expect(calculateServingsPerPackage(300, 100)).toBe('3');
    expect(calculateServingsPerPackage(250, 60)).toBe('cerca de 4');
    expect(calculateServingsPerPackage(275, 60)).toBe('cerca de 5');
    expect(calculateServingsPerPackage(150, 100)).toBe('1,5');
  });

  it('avalia lupa frontal conforme Anexo XV para sólidos e líquidos', () => {
    const solid = makeRecipe([
      makeIngredient({
        grams: 100,
        carbohydrates: 15,
        totalSugars: 15,
        addedSugars: 15,
        totalFat: 8,
        saturatedFat: 6,
        sodium: 600,
      }),
    ]);

    const solidRes = calculateRecipeNutrition(solid);
    expect(solidRes.frontalWarnings).toEqual({
      highAddedSugar: true,
      highSaturatedFat: true,
      highSodium: true,
    });

    const liquidOk = makeRecipe(
      [
        makeIngredient({
          grams: 100,
          carbohydrates: 7.4,
          totalSugars: 7.4,
          addedSugars: 7.4,
          totalFat: 5,
          saturatedFat: 2.9,
          sodium: 299,
        }),
      ],
      { isLiquid: true, density: 1 }
    );

    const liquidOkRes = calculateRecipeNutrition(liquidOk);
    expect(liquidOkRes.frontalWarnings).toEqual({
      highAddedSugar: false,
      highSaturatedFat: false,
      highSodium: false,
    });
  });

  it('aplica exceções do Anexo XVI (isentos sempre e isentos sem adição de nutrientes críticos)', () => {
    const highSatFatIngredient = makeIngredient({
      grams: 100,
      totalFat: 100,
      saturatedFat: 14,
      sodium: 700,
    });

    // Azeite/óleo vegetal é isento sempre, mesmo com > 6 g de saturada
    const oliveOil = calculateRecipeNutrition(
      makeRecipe([highSatFatIngredient], {
        productCategory: 'azeite_oleo',
        hasAddedCriticalIngredients: true,
      })
    );
    expect(oliveOil.frontalExemption.isExempt).toBe(true);
    expect(oliveOil.frontalExemption.reason).toBeTruthy();
    expect(oliveOil.rawFrontalWarnings.highSaturatedFat).toBe(true);
    expect(oliveOil.frontalWarnings).toEqual({
      highAddedSugar: false,
      highSaturatedFat: false,
      highSodium: false,
    });

    // Queijo SEM adição de nutrientes críticos é isento
    const plainCheese = calculateRecipeNutrition(
      makeRecipe([highSatFatIngredient], {
        productCategory: 'queijos',
        hasAddedCriticalIngredients: false,
      })
    );
    expect(plainCheese.frontalExemption.isExempt).toBe(true);
    expect(plainCheese.frontalWarnings.highSaturatedFat).toBe(false);

    // Queijo COM adição de nutrientes críticos NÃO é isento e exibe lupa
    const saltedCheese = calculateRecipeNutrition(
      makeRecipe([highSatFatIngredient], {
        productCategory: 'queijos',
        hasAddedCriticalIngredients: true,
      })
    );
    expect(saltedCheese.frontalExemption.isExempt).toBe(false);
    expect(saltedCheese.frontalWarnings.highSaturatedFat).toBe(true);
    expect(saltedCheese.frontalWarnings.highSodium).toBe(true);

    expect(evaluateFrontalExemption('uso_industrial_food_service', true).isExempt).toBe(true);
    expect(evaluateFrontalExemption('frutas', false).isExempt).toBe(true);
    expect(evaluateFrontalExemption('frutas', true).isExempt).toBe(false);
  });

  it('dimensiona a lupa frontal conforme a área do painel principal (Anexo XVII)', () => {
    expect(getFrontalMagnifierDimensions(30).heightMm).toBe(8);
    expect(getFrontalMagnifierDimensions(80).heightMm).toBe(10);
    expect(getFrontalMagnifierDimensions(150).heightMm).toBe(12);
    expect(getFrontalMagnifierDimensions(400).heightMm).toBe(17);
    expect(getFrontalMagnifierDimensions(2000).heightMm).toBe(26);
  });

  it('gera lista única tableRows com rótulos, valores, %VD, recuos e negrito para os 4 formatos', () => {
    const recipe = makeRecipe([
      makeIngredient({
        grams: 100,
        carbohydrates: 50,
        totalSugars: 20,
        addedSugars: 10,
        proteins: 8,
        totalFat: 12,
        saturatedFat: 4,
        transFat: 0,
        dietaryFiber: 5,
        sodium: 200,
      }),
    ]);

    const result = calculateRecipeNutrition(recipe);
    expect(result.tableRows).toHaveLength(10);
    expect(result.tableRows.map((r) => r.key)).toEqual([
      'energyKcal',
      'carbohydrates',
      'totalSugars',
      'addedSugars',
      'proteins',
      'totalFat',
      'saturatedFat',
      'transFat',
      'dietaryFiber',
      'sodium',
    ]);
    expect(result.tableRows[0]).toMatchObject({
      key: 'energyKcal',
      indentLevel: 0,
      bold: true,
      per100: result.formattedPer100g.energyKcal,
      perPortion: result.formattedPerPortion.energyKcal,
    });
    expect(result.tableRows[2]).toMatchObject({
      key: 'totalSugars',
      indentLevel: 1,
      bold: false,
      vd: '-',
    });
    expect(result.tableRows[3]).toMatchObject({
      key: 'addedSugars',
      indentLevel: 2,
      bold: false,
    });
    expect(result.tableRows[6]).toMatchObject({
      key: 'saturatedFat',
      indentLevel: 1,
    });
  });
});

