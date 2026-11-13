/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Recipe,
  CalculatedNutrition,
  LabelFormat,
  NutritionTableRow,
} from '../types/nutrition';
import { buildIngredientsListText } from '../utils/allergens';

interface NutritionLabelProps {
  recipe: Recipe;
  nutrition: CalculatedNutrition;
  format: LabelFormat;
  showIngredients?: boolean;
  showAllergens?: boolean;
}

function getIndentClass(indentLevel: NutritionTableRow['indentLevel'], compact: boolean): string {
  if (indentLevel === 1) return compact ? 'pl-2' : 'pl-3';
  if (indentLevel === 2) return compact ? 'pl-3' : 'pl-5';
  return '';
}

function renderVerticalRows(rows: NutritionTableRow[], compact = false) {
  const padY = compact ? 'py-0.5' : 'py-0.5';
  const padRight = compact ? 'pr-1.5' : 'pr-2';

  return rows.map((row) => {
    const isEnergy = Boolean(row.strongBottomBorder);
    const cellPy = isEnergy && !compact ? 'py-1' : padY;
    const indentClass = getIndentClass(row.indentLevel, compact);

    return (
      <tr
        key={row.key}
        className={`${row.bold ? 'font-bold' : ''} ${
          isEnergy ? 'border-b border-black' : ''
        }`}
      >
        <td
          className={`${cellPy} ${indentClass} text-left ${
            row.bold ? '' : 'font-normal text-black/90'
          }`}
        >
          {row.label}
        </td>
        <td className={`${cellPy} ${padRight} text-right ${isEnergy ? '' : 'font-normal'}`}>
          {row.per100}
        </td>
        <td className={`${cellPy} ${padRight} text-right ${isEnergy ? '' : 'font-normal'}`}>
          {row.perPortion}
        </td>
        <td
          className={`${cellPy} text-right ${isEnergy ? '' : 'font-normal'} ${
            row.vd === '-' ? 'text-black/50' : ''
          }`}
        >
          {row.vd}
        </td>
      </tr>
    );
  });
}

export const NutritionLabel: React.FC<NutritionLabelProps> = ({
  recipe,
  nutrition,
  format,
  showIngredients = true,
  showAllergens = true,
}) => {
  const { tableRows } = nutrition;
  const unit = recipe.isLiquid ? 'ml' : 'g';
  const portionUnit = `${recipe.portionSize} ${unit}`;

  const ingredientsText = buildIngredientsListText(recipe.ingredients);
  const { containsSentence, mayContainSentence } = nutrition.allergenStatements;
  const { statement: glutenStatement, requiresConfirmation: glutenUnconfirmed } =
    nutrition.glutenResolution;

  const leftHalfRows = tableRows.slice(0, 5);
  const rightHalfRows = tableRows.slice(5);

  const rowByKey = Object.fromEntries(tableRows.map((r) => [r.key, r])) as Record<
    NutritionTableRow['key'],
    NutritionTableRow
  >;

  const containerWidthClass =
    format === 'vertical'
      ? 'w-[320px]'
      : format === 'vertical_broken'
        ? 'w-[460px]'
        : format === 'horizontal'
          ? 'w-[620px]'
          : 'w-[380px]';

  return (
    <div
      id="anvisa-nutrition-label-container"
      className={`bg-white text-black p-4 border-2 border-black inline-block font-sans text-left ${containerWidthClass}`}
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        color: '#000000',
        backgroundColor: '#ffffff',
      }}
    >
      {/* MODELO VERTICAL PADRÃO */}
      {format === 'vertical' && (
        <div className="w-full">
          <div className="border-b-2 border-black pb-1 mb-1">
            <h2 className="text-base font-black tracking-tight uppercase leading-none">
              INFORMAÇÃO NUTRICIONAL
            </h2>
            <div className="text-[11px] leading-tight mt-1 text-black font-normal">
              Porções por embalagem:{' '}
              <span className="font-semibold">{recipe.servingsPerPackage}</span>
            </div>
            <div className="text-[11px] leading-tight text-black font-normal">
              Porção:{' '}
              <span className="font-semibold">
                {portionUnit} ({recipe.householdMeasure})
              </span>
            </div>
          </div>

          <table className="w-full text-[11px] border-collapse leading-tight">
            <thead>
              <tr className="border-b border-black text-right font-bold text-[10px]">
                <th className="text-left py-0.5 font-bold w-[46%]"></th>
                <th className="py-0.5 pr-2 font-bold w-[18%]">100 {unit}</th>
                <th className="py-0.5 pr-2 font-bold w-[18%]">{portionUnit}</th>
                <th className="py-0.5 font-bold w-[18%]">%VD*</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/30">
              {renderVerticalRows(tableRows, false)}
            </tbody>
          </table>

          <div className="border-t-2 border-black mt-1 pt-1">
            <p className="text-[9px] leading-tight text-black font-normal">
              *Percentual de valores diários fornecidos pela porção.
            </p>
          </div>
        </div>
      )}

      {/* MODELO VERTICAL QUEBRADO (DUAS COLUNAS DE NUTRIENTES LADO A LADO) */}
      {format === 'vertical_broken' && (
        <div className="w-full">
          <div className="border-b-2 border-black pb-1 mb-1">
            <h2 className="text-base font-black tracking-tight uppercase leading-none">
              INFORMAÇÃO NUTRICIONAL
            </h2>
            <div className="text-[11px] leading-tight mt-1">
              Porções por embalagem:{' '}
              <span className="font-semibold">{recipe.servingsPerPackage}</span> • Porção:{' '}
              <span className="font-semibold">
                {portionUnit} ({recipe.householdMeasure})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-[10px]">
            {[leftHalfRows, rightHalfRows].map((halfRows, colIdx) => (
              <div key={colIdx}>
                <table className="w-full border-collapse leading-tight">
                  <thead>
                    <tr className="border-b border-black text-right font-bold text-[9px]">
                      <th className="text-left py-0.5 font-bold"></th>
                      <th className="py-0.5 pr-1.5 font-bold">100{unit}</th>
                      <th className="py-0.5 pr-1.5 font-bold">{portionUnit}</th>
                      <th className="py-0.5 font-bold">%VD*</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/30">
                    {renderVerticalRows(halfRows, true)}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <div className="border-t-2 border-black mt-1.5 pt-1">
            <p className="text-[9px] leading-tight text-black font-normal">
              *Percentual de valores diários fornecidos pela porção.
            </p>
          </div>
        </div>
      )}

      {/* MODELO HORIZONTAL */}
      {format === 'horizontal' && (
        <div className="w-full">
          <div className="border-b-2 border-black pb-1 mb-1 flex items-baseline justify-between flex-wrap gap-2">
            <h2 className="text-sm font-black tracking-tight uppercase leading-none">
              INFORMAÇÃO NUTRICIONAL
            </h2>
            <div className="text-[10px] leading-tight text-black">
              Porções por embalagem: <span className="font-semibold">{recipe.servingsPerPackage}</span> | Porção:{' '}
              <span className="font-semibold">
                {portionUnit} ({recipe.householdMeasure})
              </span>
            </div>
          </div>

          <div>
            <table className="w-full text-[10px] border-collapse leading-tight">
              <thead>
                <tr className="border-b border-black text-center font-bold text-[9px]">
                  <th className="text-left py-0.5 font-bold"></th>
                  {tableRows.map((row) => (
                    <th
                      key={row.key}
                      className={`py-0.5 px-1 ${
                        row.bold ? 'font-bold' : 'font-normal text-black/80'
                      }`}
                    >
                      {row.shortLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/30 text-center">
                <tr>
                  <td className="py-0.5 text-left font-bold text-[9px]">100 {unit}</td>
                  {tableRows.map((row) => (
                    <td key={row.key} className="py-0.5 px-1">
                      {row.per100} {row.unitSuffix}
                    </td>
                  ))}
                </tr>
                <tr className="font-semibold">
                  <td className="py-0.5 text-left font-bold text-[9px]">{portionUnit}</td>
                  {tableRows.map((row) => (
                    <td key={row.key} className="py-0.5 px-1">
                      {row.perPortion} {row.unitSuffix}
                    </td>
                  ))}
                </tr>
                <tr className="text-black/80 font-normal">
                  <td className="py-0.5 text-left font-bold text-[9px]">%VD*</td>
                  {tableRows.map((row) => (
                    <td key={row.key} className="py-0.5 px-1">
                      {row.vd === '-' ? '-' : `${row.vd}%`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="border-t-2 border-black mt-1.5 pt-1">
            <p className="text-[9px] leading-tight text-black font-normal">
              *Percentual de valores diários fornecidos pela porção.
            </p>
          </div>
        </div>
      )}

      {/* MODELO LINEAR / AGREGADO (PARA EMBALAGENS PEQUENAS) */}
      {format === 'linear' && (
        <div className="w-full text-[10px] leading-snug">
          <div className="font-bold uppercase tracking-tight border-b border-black pb-0.5 mb-1 text-[11px]">
            INFORMAÇÃO NUTRICIONAL
          </div>
          <p className="mb-1">
            <span className="font-semibold">Porções por embalagem:</span> {recipe.servingsPerPackage} •{' '}
            <span className="font-semibold">Porção:</span> {portionUnit} ({recipe.householdMeasure}).
          </p>
          <p className="text-[9.5px]">
            <span className="font-semibold">Por 100 {unit} ({portionUnit}, %VD*):</span>{' '}
            Valor energético {rowByKey.energyKcal.per100} kcal ({rowByKey.energyKcal.perPortion} kcal, {rowByKey.energyKcal.vd}%) •{' '}
            Carboidratos {rowByKey.carbohydrates.per100} g ({rowByKey.carbohydrates.perPortion} g, {rowByKey.carbohydrates.vd}%), dos quais Açúcares totais {rowByKey.totalSugars.per100} g ({rowByKey.totalSugars.perPortion} g), Açúcares adicionados {rowByKey.addedSugars.per100} g ({rowByKey.addedSugars.perPortion} g, {rowByKey.addedSugars.vd}%) •{' '}
            Proteínas {rowByKey.proteins.per100} g ({rowByKey.proteins.perPortion} g, {rowByKey.proteins.vd}%) •{' '}
            Gorduras totais {rowByKey.totalFat.per100} g ({rowByKey.totalFat.perPortion} g, {rowByKey.totalFat.vd}%), das quais Gorduras saturadas {rowByKey.saturatedFat.per100} g ({rowByKey.saturatedFat.perPortion} g, {rowByKey.saturatedFat.vd}%), Gorduras trans {rowByKey.transFat.per100} g ({rowByKey.transFat.perPortion} g) •{' '}
            Fibra alimentar {rowByKey.dietaryFiber.per100} g ({rowByKey.dietaryFiber.perPortion} g, {rowByKey.dietaryFiber.vd}%) •{' '}
            Sódio {rowByKey.sodium.per100} mg ({rowByKey.sodium.perPortion} mg, {rowByKey.sodium.vd}%).
          </p>
          <p className="text-[8.5px] mt-1 pt-1 border-t border-black text-black/80">
            *Percentual de valores diários fornecidos pela porção.
          </p>
        </div>
      )}

      {/* INGREDIENTES, ALERGÊNICOS, LACTOSE E GLÚTEN CONFORME RDC 727/2022 E RDC 136/2017 */}
      {(showIngredients || showAllergens) && (
        <div className="mt-2.5 pt-2 border-t-2 border-black text-[10px] leading-tight space-y-1 break-words">
          {showIngredients && ingredientsText && (
            <p>
              <span className="font-bold uppercase">INGREDIENTES:</span>{' '}
              <span>{ingredientsText}</span>
            </p>
          )}

          {showAllergens && (
            <>
              {containsSentence && (
                <p className="font-bold uppercase">{containsSentence}</p>
              )}

              {mayContainSentence && (
                <p className="font-bold uppercase">{mayContainSentence}</p>
              )}

              {nutrition.containsLactose && (
                <p className="font-bold uppercase">CONTÉM LACTOSE</p>
              )}

              {glutenStatement ? (
                <p className="font-bold uppercase">{glutenStatement}</p>
              ) : glutenUnconfirmed ? (
                <p className="font-bold uppercase text-amber-800 bg-amber-100 px-1.5 py-0.5 border border-amber-400">
                  GLÚTEN: CONFIRMAÇÃO EXPLÍCITA PENDENTE (EXPORTAÇÃO BLOQUEADA)
                </p>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
};
