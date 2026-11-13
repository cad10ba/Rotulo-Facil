/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import type { AllergenId } from '../types/nutrition.ts';

const ALLERGEN_ID_VALUES: [AllergenId, ...AllergenId[]] = [
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
];

const nonNegativeNumber = z
  .number({ message: 'Deve ser um número válido.' })
  .finite('O número deve ser finito.')
  .min(0, 'Valores numéricos devem ser maiores ou iguais a zero.');

const nullableNonNegativeNumber = nonNegativeNumber.nullable().optional();

const nutritionValuesSchema = z.object({
  energyKcal: nullableNonNegativeNumber,
  energyKj: nullableNonNegativeNumber,
  carbohydrates: nullableNonNegativeNumber,
  totalSugars: nullableNonNegativeNumber,
  addedSugars: nullableNonNegativeNumber,
  proteins: nullableNonNegativeNumber,
  totalFat: nullableNonNegativeNumber,
  saturatedFat: nullableNonNegativeNumber,
  transFat: nullableNonNegativeNumber,
  dietaryFiber: nullableNonNegativeNumber,
  sodium: nullableNonNegativeNumber,
});

export const allergenIdSchema = z.enum(ALLERGEN_ID_VALUES);

export const ingredientInputSchema = z.object({
  id: z.string().max(120).optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Nome do ingrediente é obrigatório.')
    .max(200, 'Nome do ingrediente deve ter no máximo 200 caracteres.'),
  labelName: z.string().max(200).nullable().optional(),
  isAdditive: z.boolean().optional(),
  additiveFunction: z.string().max(120).nullable().optional(),
  grams: nonNegativeNumber,
  nutritionPer100g: nutritionValuesSchema,
  tacoId: z.string().max(64).nullable().optional(),
  tacoName: z.string().max(200).nullable().optional(),
  allergens: z.array(z.string().max(100)).max(30).optional(),
  allergenDeclarations: z
    .array(
      z.object({
        allergenId: allergenIdSchema,
        presence: z.enum(['contains', 'derivatives']),
      })
    )
    .max(30)
    .optional(),
  containsGluten: z.boolean().optional(),
  source: z.enum(['taco', 'manual', 'gemini_ai', 'taco_local']).optional(),
  isAddedSugar: z.boolean().optional(),
});

export const recipeInputSchema = z.object({
  id: z.string().max(120).optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Nome da receita é obrigatório.')
    .max(200, 'Nome da receita deve ter no máximo 200 caracteres.'),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(100).optional(),
  isLiquid: z.boolean().optional(),
  density: nonNegativeNumber.optional(),
  netWeight: nullableNonNegativeNumber,
  panelArea: nullableNonNegativeNumber,
  productCategory: z.string().max(64).optional(),
  hasAddedCriticalIngredients: z.boolean().optional(),
  portionSize: nonNegativeNumber,
  householdMeasure: z.string().max(150).optional(),
  servingsPerPackage: z.union([nonNegativeNumber, z.string().max(80)]).optional(),
  readyWeightGrams: nullableNonNegativeNumber,
  ingredients: z
    .array(ingredientInputSchema)
    .max(100, 'Uma receita pode conter no máximo 100 ingredientes.'),
  declaredAllergens: z.array(z.string().max(100)).max(30).optional(),
  mayContainAllergens: z.array(allergenIdSchema).max(30).optional(),
  containsGluten: z.boolean().optional(),
  glutenStatus: z.enum(['unconfirmed', 'contains', 'does_not_contain']).optional(),
  containsLactose: z.boolean().optional(),
  exportTermsAccepted: z.boolean().optional(),
  exportTermsAcceptedAt: z.string().max(64).nullable().optional(),
  createdAt: z.string().max(64).optional(),
  updatedAt: z.string().max(64).optional(),
});

export const migrateRecipesInputSchema = z.object({
  recipes: z
    .array(recipeInputSchema)
    .max(200, 'Máximo de 200 receitas permitidas por migração.'),
});

export type ValidatedRecipeInput = z.infer<typeof recipeInputSchema>;
