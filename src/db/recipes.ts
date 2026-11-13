/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { decryptJson, encryptJson, needsReencryption } from '../lib/crypto.ts';
import { withUserRls } from './index.ts';
import { recipes } from './schema.ts';
import type {
  AllergenId,
  FrontalProductCategory,
  GlutenStatus,
  Ingredient,
  Recipe,
} from '../types/nutrition.ts';
import type { ValidatedRecipeInput } from '../validation/recipeSchemas.ts';

export class RecipeNotFoundError extends Error {
  constructor(message = 'Receita não encontrada.') {
    super(message);
    this.name = 'RecipeNotFoundError';
  }
}

export class InvalidRecipeIdError extends Error {
  constructor(message = 'ID de receita inválido.') {
    super(message);
    this.name = 'InvalidRecipeIdError';
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

type EncryptedRecipePayload = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;

function buildEncryptedRecipePayload(
  input: ValidatedRecipeInput | Recipe
): EncryptedRecipePayload {
  const safeDensity =
    input.density !== undefined && input.density !== null && Number(input.density) > 0
      ? Number(input.density)
      : 1;
  const safeNetWeight =
    input.netWeight !== undefined && input.netWeight !== null && Number(input.netWeight) > 0
      ? Number(input.netWeight)
      : undefined;
  const safePanelArea =
    input.panelArea !== undefined && input.panelArea !== null && Number(input.panelArea) > 0
      ? Number(input.panelArea)
      : undefined;
  const safeProductCategory =
    (input.productCategory as FrontalProductCategory) || 'geral';
  const safeHasAddedCritical = Boolean(input.hasAddedCriticalIngredients);

  const normalizedIngredients: Ingredient[] = Array.isArray(input.ingredients)
    ? input.ingredients.map((ing, idx) => ({
        ...ing,
        id: ing.id && ing.id.trim() ? ing.id : `ing-${idx + 1}`,
        labelName: ing.labelName ?? undefined,
        additiveFunction: ing.additiveFunction ?? undefined,
        tacoName: ing.tacoName ?? undefined,
        nutritionPer100g: {
          energyKcal: ing.nutritionPer100g.energyKcal ?? null,
          energyKj: ing.nutritionPer100g.energyKj ?? null,
          carbohydrates: ing.nutritionPer100g.carbohydrates ?? null,
          totalSugars: ing.nutritionPer100g.totalSugars ?? null,
          addedSugars: ing.nutritionPer100g.addedSugars ?? null,
          proteins: ing.nutritionPer100g.proteins ?? null,
          totalFat: ing.nutritionPer100g.totalFat ?? null,
          saturatedFat: ing.nutritionPer100g.saturatedFat ?? null,
          transFat: ing.nutritionPer100g.transFat ?? null,
          dietaryFiber: ing.nutritionPer100g.dietaryFiber ?? null,
          sodium: ing.nutritionPer100g.sodium ?? null,
        },
      }))
    : [];

  const exportTermsAccepted = Boolean(input.exportTermsAccepted);
  const exportTermsAcceptedAt = (() => {
    if (!exportTermsAccepted) return undefined;
    if (input.exportTermsAcceptedAt) {
      const parsed = new Date(input.exportTermsAcceptedAt);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
    }
    return new Date().toISOString();
  })();

  return {
    name: input.name || 'Receita Sem Título',
    description: input.description ?? undefined,
    category: input.category || 'Geral',
    isLiquid: Boolean(input.isLiquid),
    density: safeDensity,
    netWeight: safeNetWeight,
    panelArea: safePanelArea,
    productCategory: safeProductCategory,
    hasAddedCriticalIngredients: safeHasAddedCritical,
    portionSize: Number(input.portionSize) > 0 ? Number(input.portionSize) : 50,
    householdMeasure: input.householdMeasure || '1 porção',
    servingsPerPackage:
      input.servingsPerPackage !== undefined ? input.servingsPerPackage : 'cerca de 5 porções',
    readyWeightGrams:
      input.readyWeightGrams !== undefined && input.readyWeightGrams !== null
        ? Number(input.readyWeightGrams)
        : undefined,
    ingredients: normalizedIngredients,
    declaredAllergens: Array.isArray(input.declaredAllergens) ? input.declaredAllergens : [],
    mayContainAllergens: Array.isArray(input.mayContainAllergens)
      ? (input.mayContainAllergens as AllergenId[])
      : [],
    containsGluten: Boolean(input.containsGluten),
    glutenStatus:
      (input.glutenStatus as GlutenStatus) ||
      (input.containsGluten ? 'contains' : 'unconfirmed'),
    containsLactose: Boolean(input.containsLactose),
    exportTermsAccepted,
    exportTermsAcceptedAt,
  };
}

function normalizeDecryptedRecipe(
  row: typeof recipes.$inferSelect,
  data: Partial<EncryptedRecipePayload>
): Recipe {
  return {
    id: row.id,
    name: data.name || 'Receita Sem Título',
    description: data.description ?? undefined,
    category: data.category || 'Geral',
    isLiquid: Boolean(data.isLiquid),
    density: data.density ?? 1,
    netWeight: data.netWeight ?? undefined,
    panelArea: data.panelArea ?? undefined,
    productCategory: (data.productCategory as FrontalProductCategory) || 'geral',
    hasAddedCriticalIngredients: Boolean(data.hasAddedCriticalIngredients),
    portionSize: Number(data.portionSize) > 0 ? Number(data.portionSize) : 50,
    householdMeasure: data.householdMeasure || '1 porção',
    servingsPerPackage:
      data.servingsPerPackage !== undefined ? data.servingsPerPackage : 'cerca de 5 porções',
    readyWeightGrams: data.readyWeightGrams ?? undefined,
    ingredients: Array.isArray(data.ingredients) ? data.ingredients : [],
    declaredAllergens: Array.isArray(data.declaredAllergens) ? data.declaredAllergens : [],
    mayContainAllergens: Array.isArray(data.mayContainAllergens)
      ? (data.mayContainAllergens as AllergenId[])
      : [],
    containsGluten: Boolean(data.containsGluten),
    glutenStatus:
      (data.glutenStatus as GlutenStatus) ||
      (data.containsGluten ? 'contains' : 'unconfirmed'),
    containsLactose: Boolean(data.containsLactose),
    exportTermsAccepted: Boolean(data.exportTermsAccepted),
    exportTermsAcceptedAt: data.exportTermsAcceptedAt ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function recipeSignature(name: string, portionSize: number, ingredientsCount: number): string {
  return `${name.trim().toLowerCase()}::${portionSize}::${ingredientsCount}`;
}

export async function getUserRecipes(uid: string): Promise<Recipe[]> {
  try {
    return await withUserRls(uid, async (tx) => {
      const rows = await tx
        .select()
        .from(recipes)
        .where(eq(recipes.userId, uid))
        .orderBy(desc(recipes.updatedAt));

      const result: Recipe[] = [];

      for (const row of rows) {
        let decrypted: EncryptedRecipePayload;
        try {
          decrypted = decryptJson<EncryptedRecipePayload>(row.payloadEnc, uid, row.id);
        } catch {
          console.error(`Falha ao decifrar receita: ${row.id}`);
          continue;
        }

        if (needsReencryption(row.payloadEnc)) {
          try {
            const reencrypted = encryptJson(decrypted, uid, row.id);
            await tx
              .update(recipes)
              .set({
                payloadEnc: reencrypted.payload,
                keyVersion: reencrypted.keyVersion,
              })
              .where(and(eq(recipes.id, row.id), eq(recipes.userId, uid)));
          } catch {
            console.error(`Falha ao recifrar receita: ${row.id}`);
          }
        }

        result.push(normalizeDecryptedRecipe(row, decrypted));
      }

      return result;
    });
  } catch (error) {
    console.error(
      'Erro ao carregar receitas no banco de dados:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao carregar suas receitas.', { cause: error });
  }
}

/**
 * Cria uma nova receita gerando o ID exclusivamente no servidor (crypto.randomUUID)
 * e cifrando todo o conteúdo em payload_enc.
 */
export async function createUserRecipe(
  uid: string,
  input: ValidatedRecipeInput
): Promise<Recipe> {
  try {
    const serverId = randomUUID();
    const payloadObj = buildEncryptedRecipePayload(input);
    const { payload, keyVersion } = encryptJson(payloadObj, uid, serverId);

    const rows = await withUserRls(uid, async (tx) => {
      return tx
        .insert(recipes)
        .values({
          id: serverId,
          userId: uid,
          payloadEnc: payload,
          keyVersion,
        })
        .returning();
    });

    const row = rows[0];
    return normalizeDecryptedRecipe(row, payloadObj);
  } catch (error) {
    console.error(
      'Erro ao criar receita no banco de dados:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao criar receita no banco de dados.', { cause: error });
  }
}

/**
 * Atualiza uma receita existente pertencente ao usuário autenticado (sem upsert).
 */
export async function updateUserRecipe(
  uid: string,
  recipeId: string,
  input: ValidatedRecipeInput
): Promise<Recipe> {
  if (!isValidUuid(recipeId)) {
    throw new InvalidRecipeIdError();
  }

  try {
    const payloadObj = buildEncryptedRecipePayload(input);
    const { payload, keyVersion } = encryptJson(payloadObj, uid, recipeId);

    const rows = await withUserRls(uid, async (tx) => {
      return tx
        .update(recipes)
        .set({
          payloadEnc: payload,
          keyVersion,
          updatedAt: new Date(),
        })
        .where(and(eq(recipes.id, recipeId), eq(recipes.userId, uid)))
        .returning();
    });

    if (!rows.length) {
      throw new RecipeNotFoundError();
    }

    return normalizeDecryptedRecipe(rows[0], payloadObj);
  } catch (error) {
    if (error instanceof RecipeNotFoundError || error instanceof InvalidRecipeIdError) {
      throw error;
    }
    console.error(
      'Erro ao atualizar receita no banco de dados:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao atualizar a receita no banco de dados.', { cause: error });
  }
}

export async function deleteUserRecipe(uid: string, recipeId: string): Promise<boolean> {
  if (!isValidUuid(recipeId)) {
    throw new InvalidRecipeIdError();
  }

  try {
    const deleted = await withUserRls(uid, async (tx) => {
      return tx
        .delete(recipes)
        .where(and(eq(recipes.id, recipeId), eq(recipes.userId, uid)))
        .returning({ id: recipes.id });
    });

    return deleted.length > 0;
  } catch (error) {
    console.error(
      'Erro ao excluir receita no banco de dados:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao excluir a receita.', { cause: error });
  }
}

export async function migrateUserRecipes(
  uid: string,
  localRecipes: ValidatedRecipeInput[]
): Promise<Recipe[]> {
  try {
    return await withUserRls(uid, async (tx) => {
      const existingRows = await tx
        .select()
        .from(recipes)
        .where(eq(recipes.userId, uid))
        .orderBy(desc(recipes.updatedAt));

      const existingSignatures = new Set<string>();
      const finalRecipes: Recipe[] = [];

      for (const row of existingRows) {
        try {
          const decrypted = decryptJson<EncryptedRecipePayload>(row.payloadEnc, uid, row.id);
          if (needsReencryption(row.payloadEnc)) {
            try {
              const reencrypted = encryptJson(decrypted, uid, row.id);
              await tx
                .update(recipes)
                .set({
                  payloadEnc: reencrypted.payload,
                  keyVersion: reencrypted.keyVersion,
                })
                .where(and(eq(recipes.id, row.id), eq(recipes.userId, uid)));
            } catch {
              console.error(`Falha ao recifrar receita: ${row.id}`);
            }
          }
          const normalized = normalizeDecryptedRecipe(row, decrypted);
          finalRecipes.push(normalized);
          existingSignatures.add(
            recipeSignature(
              normalized.name,
              normalized.portionSize,
              normalized.ingredients.length
            )
          );
        } catch {
          console.error(`Falha ao decifrar receita: ${row.id}`);
        }
      }

      const insertedRecipes: Recipe[] = [];

      for (const item of localRecipes) {
        if (!item || !item.name) continue;
        const payloadObj = buildEncryptedRecipePayload(item);
        const signature = recipeSignature(
          payloadObj.name,
          payloadObj.portionSize,
          payloadObj.ingredients.length
        );
        if (existingSignatures.has(signature)) {
          continue;
        }

        const serverId = randomUUID();
        const { payload, keyVersion } = encryptJson(payloadObj, uid, serverId);

        const inserted = await tx
          .insert(recipes)
          .values({
            id: serverId,
            userId: uid,
            payloadEnc: payload,
            keyVersion,
          })
          .returning();

        if (inserted[0]) {
          insertedRecipes.push(normalizeDecryptedRecipe(inserted[0], payloadObj));
          existingSignatures.add(signature);
        }
      }

      return [...insertedRecipes, ...finalRecipes].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });
  } catch (error) {
    console.error(
      'Erro ao migrar receitas no banco de dados:',
      error instanceof Error ? error.name : 'UnknownError'
    );
    throw new Error('Falha ao transferir receitas para sua conta.', { cause: error });
  }
}
