/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ANVISA_LACTOSE_LIMIT_MG_PER_100,
  RDC_727_ALLERGENS,
  buildAllergenStatements,
  buildIngredientsListText,
  resolveGlutenStatus,
  suggestAllergensFromIngredientName,
} from './allergens';
import { calculateRecipeNutrition } from './nutritionCalculator';
import { Ingredient, Recipe } from '../types/nutrition';

function makeIng(partial: Partial<Ingredient>): Ingredient {
  return {
    id: partial.id ?? 'ing-1',
    name: partial.name ?? 'Ingrediente',
    labelName: partial.labelName,
    grams: partial.grams ?? 100,
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
      ...(partial.nutritionPer100g ?? {}),
    },
    tacoId: partial.tacoId,
    allergens: partial.allergens ?? [],
    allergenDeclarations: partial.allergenDeclarations,
    containsGluten: partial.containsGluten ?? false,
    isAdditive: partial.isAdditive,
    additiveFunction: partial.additiveFunction,
    source: partial.source ?? 'taco',
    isAddedSugar: partial.isAddedSugar ?? false,
  };
}

function makeRec(ingredients: Ingredient[], overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: 'rec-1',
    name: 'Receita Teste',
    category: 'Geral',
    isLiquid: false,
    density: 1,
    portionSize: 50,
    householdMeasure: '1 unidade',
    servingsPerPackage: '2',
    ingredients,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('RDC 727/2022 - Lista fechada e pré-marcação por regra', () => {
  it('contém todos os grupos oficiais da lista fechada de alergênicos', () => {
    const ids = RDC_727_ALLERGENS.map((a) => a.id);
    expect(ids).toEqual([
      'trigo',
      'centeio',
      'cevada',
      'aveia',
      'estirpes_hibridizadas',
      'crustaceos',
      'ovos',
      'peixes',
      'amendoim',
      'soja',
      'leite',
      'amendoa',
      'avela',
      'castanha_de_caju',
      'castanha_do_brasil',
      'macadamia',
      'nozes',
      'peca',
      'pistache',
      'pinoli',
      'castanhas',
      'latex_natural',
    ]);
    expect(ANVISA_LACTOSE_LIMIT_MG_PER_100).toBe(100);
  });

  it('pré-marca alergênicos com "contains" ou "derivatives" a partir do nome do ingrediente', () => {
    expect(suggestAllergensFromIngredientName('Queijo minas meia cura')).toEqual([
      { allergenId: 'leite', presence: 'derivatives' },
    ]);
    expect(suggestAllergensFromIngredientName('Leite de vaca integral')).toEqual([
      { allergenId: 'leite', presence: 'contains' },
    ]);
    expect(suggestAllergensFromIngredientName('Farinha de trigo enriquecida')).toEqual([
      { allergenId: 'trigo', presence: 'contains' },
    ]);
    expect(suggestAllergensFromIngredientName('Óleo de soja refinado')).toEqual([
      { allergenId: 'soja', presence: 'derivatives' },
    ]);
  });
});

describe('RDC 727/2022 - Frases de alergênicos (CONTÉM / DERIVADOS / PODE CONTER)', () => {
  it('gera frases em caixa alta combinando CONTÉM e DERIVADOS e separando PODE CONTER', () => {
    const recipe = makeRec(
      [
        makeIng({
          id: 'i1',
          name: 'Farinha de trigo',
          allergenDeclarations: [{ allergenId: 'trigo', presence: 'contains' }],
        }),
        makeIng({
          id: 'i2',
          name: 'Ovo inteiro',
          allergenDeclarations: [{ allergenId: 'ovos', presence: 'contains' }],
        }),
        makeIng({
          id: 'i3',
          name: 'Óleo de soja',
          allergenDeclarations: [{ allergenId: 'soja', presence: 'derivatives' }],
        }),
      ],
      {
        mayContainAllergens: ['amendoim', 'trigo'], // trigo já está em CONTÉM, então fica fora de PODE CONTER
      }
    );

    const statements = buildAllergenStatements(recipe);
    expect(statements.containsSentence).toBe(
      'ALÉRGICOS: CONTÉM TRIGO, OVOS E DERIVADOS DE SOJA.'
    );
    expect(statements.mayContainSentence).toBe('ALÉRGICOS: PODE CONTER AMENDOIM.');
    expect(statements.hasGlutenCereal).toBe(true);
  });

  it('não gera nenhuma frase quando não há alergênicos declarados', () => {
    const recipe = makeRec([
      makeIng({
        id: 'i1',
        name: 'Cenoura crua',
        allergenDeclarations: [],
      }),
    ]);

    const statements = buildAllergenStatements(recipe);
    expect(statements.containsSentence).toBeNull();
    expect(statements.mayContainSentence).toBeNull();
  });
});

describe('Lei nº 10.674/2003 & RDC 136/2017 - Glúten e Lactose', () => {
  it('marca CONTÉM GLÚTEN automaticamente quando houver trigo, centeio, cevada ou aveia', () => {
    const recipe = makeRec([
      makeIng({
        name: 'Aveia em flocos',
        allergenDeclarations: [{ allergenId: 'aveia', presence: 'contains' }],
      }),
    ]);

    const gluten = resolveGlutenStatus(recipe);
    expect(gluten.effectiveStatus).toBe('contains');
    expect(gluten.statement).toBe('CONTÉM GLÚTEN');
    expect(gluten.requiresConfirmation).toBe(false);
  });

  it('NUNCA declara NÃO CONTÉM GLÚTEN automaticamente sem confirmação explícita do usuário', () => {
    const unconfirmedRecipe = makeRec(
      [
        makeIng({
          name: 'Polvilho doce',
          allergenDeclarations: [],
          containsGluten: false,
        }),
      ],
      {
        containsGluten: false,
        glutenStatus: 'unconfirmed',
      }
    );

    const unconfirmed = resolveGlutenStatus(unconfirmedRecipe);
    expect(unconfirmed.effectiveStatus).toBe('unconfirmed');
    expect(unconfirmed.statement).toBeNull();
    expect(unconfirmed.requiresConfirmation).toBe(true);

    const confirmedRecipe = makeRec(unconfirmedRecipe.ingredients, {
      glutenStatus: 'does_not_contain',
    });
    const confirmed = resolveGlutenStatus(confirmedRecipe);
    expect(confirmed.effectiveStatus).toBe('does_not_contain');
    expect(confirmed.statement).toBe('NÃO CONTÉM GLÚTEN');
    expect(confirmed.requiresConfirmation).toBe(false);
  });

  it('propaga contém lactose e declarações de alergênicos em calculateRecipeNutrition', () => {
    const recipe = makeRec(
      [
        makeIng({
          name: 'Leite integral',
          grams: 100,
          allergenDeclarations: [{ allergenId: 'leite', presence: 'contains' }],
        }),
      ],
      {
        containsLactose: true,
        glutenStatus: 'does_not_contain',
      }
    );

    const calc = calculateRecipeNutrition(recipe);
    expect(calc.containsLactose).toBe(true);
    expect(calc.allergenStatements.containsSentence).toBe('ALÉRGICOS: CONTÉM LEITE.');
    expect(calc.glutenResolution.statement).toBe('NÃO CONTÉM GLÚTEN');
  });
});

describe('RDC 727/2022 - Lista de ingredientes', () => {
  it('ordena em ordem decrescente, respeita labelName editável, inclui água e formata aditivos como "função nome"', () => {
    const text = buildIngredientsListText([
      makeIng({
        id: '1',
        name: 'Bicarbonato de sódio (TACO)',
        labelName: 'bicarbonato de sódio',
        isAdditive: true,
        additiveFunction: 'fermento químico',
        grams: 10,
      }),
      makeIng({
        id: '2',
        name: 'Farinha, de trigo',
        labelName: 'farinha de trigo enriquecida com ferro e ácido fólico',
        grams: 300,
      }),
      makeIng({
        id: '3',
        name: 'Água',
        labelName: 'água',
        grams: 150,
      }),
    ]);

    expect(text).toBe(
      'farinha de trigo enriquecida com ferro e ácido fólico, água, fermento químico bicarbonato de sódio.'
    );
  });
});
