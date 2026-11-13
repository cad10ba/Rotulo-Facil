/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  migrateRecipesInputSchema,
  recipeInputSchema,
} from './recipeSchemas';

function makeValidRecipe(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Pão Integral',
    category: 'Panificação',
    isLiquid: false,
    density: 1,
    portionSize: 50,
    householdMeasure: '2 fatias (50 g)',
    servingsPerPackage: 'cerca de 10 porções',
    ingredients: [
      {
        id: 'ing-1',
        name: 'Farinha de trigo integral',
        grams: 300,
        nutritionPer100g: {
          energyKcal: 340,
          carbohydrates: 70,
          totalSugars: null,
          addedSugars: 0,
          proteins: 12,
          totalFat: 2,
          saturatedFat: 0.4,
          transFat: 0,
          dietaryFiber: 9,
          sodium: 5,
        },
        source: 'taco',
      },
    ],
    ...overrides,
  };
}

describe('Zod - Validação de receitas e migração (Etapa 5)', () => {
  it('aceita receita válida com nutrientes nulos da TACO e números >= 0', () => {
    const parsed = recipeInputSchema.safeParse(makeValidRecipe());
    expect(parsed.success).toBe(true);
  });

  it('rejeita nome de receita vazio ou com mais de 200 caracteres', () => {
    expect(recipeInputSchema.safeParse(makeValidRecipe({ name: '   ' })).success).toBe(false);
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ name: 'A'.repeat(201) })).success
    ).toBe(false);
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ name: 'A'.repeat(200) })).success
    ).toBe(true);
  });

  it('rejeita receita com mais de 100 ingredientes', () => {
    const baseIng = makeValidRecipe().ingredients[0];
    const tooMany = Array.from({ length: 101 }, (_, i) => ({
      ...baseIng,
      id: `ing-${i}`,
    }));
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ ingredients: tooMany })).success
    ).toBe(false);

    const exact100 = tooMany.slice(0, 100);
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ ingredients: exact100 })).success
    ).toBe(true);
  });

  it('rejeita valores numéricos negativos em receita e ingredientes', () => {
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ portionSize: -1 })).success
    ).toBe(false);
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ density: -0.5 })).success
    ).toBe(false);

    const badIng = {
      ...makeValidRecipe().ingredients[0],
      grams: -10,
    };
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ ingredients: [badIng] })).success
    ).toBe(false);

    const badNutrient = {
      ...makeValidRecipe().ingredients[0],
      nutritionPer100g: {
        ...makeValidRecipe().ingredients[0].nutritionPer100g,
        sodium: -5,
      },
    };
    expect(
      recipeInputSchema.safeParse(makeValidRecipe({ ingredients: [badNutrient] })).success
    ).toBe(false);
  });

  it('rejeita migração com mais de 200 receitas e aceita até 200', () => {
    const valid = makeValidRecipe();
    const list201 = Array.from({ length: 201 }, () => valid);
    expect(
      migrateRecipesInputSchema.safeParse({ recipes: list201 }).success
    ).toBe(false);

    const list200 = list201.slice(0, 200);
    expect(
      migrateRecipesInputSchema.safeParse({ recipes: list200 }).success
    ).toBe(true);
  });

  it('valida exportTermsAccepted e exportTermsAcceptedAt no schema da receita', () => {
    const parsedAccepted = recipeInputSchema.safeParse(
      makeValidRecipe({
        exportTermsAccepted: true,
        exportTermsAcceptedAt: '2026-11-12T12:00:00.000Z',
      })
    );
    expect(parsedAccepted.success).toBe(true);
    if (parsedAccepted.success) {
      expect(parsedAccepted.data.exportTermsAccepted).toBe(true);
      expect(parsedAccepted.data.exportTermsAcceptedAt).toBe('2026-11-12T12:00:00.000Z');
    }
  });
});

