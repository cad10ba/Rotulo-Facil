/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Exportação vetorial de alta precisão para gráfica (IN 75/2020 & RDC 429/2020):
 * - PDF vetorial 1:1 (tamanho real em mm, Helvetica, preto sobre branco, sem cabeçalho extra)
 * - PDF vetorial em folha A4 com múltiplas etiquetas e marcas de corte
 * - SVG vetorial da tabela nutricional (1 unidade = 1 mm)
 * - PNG em 600 DPI calculado a partir das dimensões reais em mm
 */

import jsPDF from 'jspdf';
import type {
  CalculatedNutrition,
  LabelFormat,
  Recipe,
} from '../types/nutrition';
import { getTableTypographySpec } from './anvisaRules';
import { buildIngredientsListText } from './allergens';

export const PT_TO_MM = 25.4 / 72;
export const PRINT_DPI = 600;
export const MM_PER_INCH = 25.4;

export interface LabelExportOptions {
  format: LabelFormat;
  showIngredients: boolean;
  showAllergens: boolean;
}

export type VectorDrawOp =
  | {
      type: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      lineWidth?: number;
    }
  | {
      type: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      lineWidth: number;
      color?: string;
    }
  | {
      type: 'text';
      text: string;
      x: number;
      y: number;
      fontSizePt: number;
      bold?: boolean;
      align?: 'left' | 'right' | 'center';
      color?: string;
    };

export interface VectorLabelPlan {
  widthMm: number;
  heightMm: number;
  ops: VectorDrawOp[];
  typography: ReturnType<typeof getTableTypographySpec>;
}

export interface A4SheetPlacement {
  x: number;
  y: number;
}

export interface A4SheetLayout {
  pageWidthMm: number;
  pageHeightMm: number;
  orientation: 'portrait' | 'landscape';
  cols: number;
  rows: number;
  placements: A4SheetPlacement[];
}

export function buildSafeFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'rotulo_nutricional';
}

export function compute600DpiPixels(widthMm: number, heightMm: number): {
  widthPx: number;
  heightPx: number;
} {
  return {
    widthPx: Math.max(1, Math.round((widthMm / MM_PER_INCH) * PRINT_DPI)),
    heightPx: Math.max(1, Math.round((heightMm / MM_PER_INCH) * PRINT_DPI)),
  };
}

export function computeA4SheetLayout(
  labelWidthMm: number,
  labelHeightMm: number,
  marginMm = 10,
  gapMm = 8
): A4SheetLayout {
  const portraitFits = labelWidthMm <= 210 - marginMm * 2;
  const landscapeFits = labelWidthMm <= 297 - marginMm * 2;
  const orientation: 'portrait' | 'landscape' =
    !portraitFits && landscapeFits ? 'landscape' : 'portrait';

  const pageWidthMm = orientation === 'landscape' ? 297 : 210;
  const pageHeightMm = orientation === 'landscape' ? 210 : 297;

  const usableW = Math.max(labelWidthMm, pageWidthMm - marginMm * 2);
  const usableH = Math.max(labelHeightMm, pageHeightMm - marginMm * 2);

  const cols = Math.max(1, Math.floor((usableW + gapMm) / (labelWidthMm + gapMm)));
  const rows = Math.max(1, Math.floor((usableH + gapMm) / (labelHeightMm + gapMm)));

  const gridW = cols * labelWidthMm + (cols - 1) * gapMm;
  const gridH = rows * labelHeightMm + (rows - 1) * gapMm;
  const startX = Math.max(marginMm, (pageWidthMm - gridW) / 2);
  const startY = Math.max(marginMm, (pageHeightMm - gridH) / 2);

  const placements: A4SheetPlacement[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      placements.push({
        x: Number((startX + c * (labelWidthMm + gapMm)).toFixed(2)),
        y: Number((startY + r * (labelHeightMm + gapMm)).toFixed(2)),
      });
    }
  }

  return {
    pageWidthMm,
    pageHeightMm,
    orientation,
    cols,
    rows,
    placements,
  };
}

function measureSplitLines(
  doc: jsPDF,
  text: string,
  maxWidthMm: number,
  fontSizePt: number,
  bold: boolean
): string[] {
  doc.setFont('helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(fontSizePt);
  return doc.splitTextToSize(text, Math.max(5, maxWidthMm)) as string[];
}

function lineHeightMm(fontSizePt: number, multiplier = 1.32): number {
  return fontSizePt * PT_TO_MM * multiplier;
}

function baselineFromTop(topY: number, fontSizePt: number, rowHeight: number): number {
  const capHeightMm = fontSizePt * PT_TO_MM * 0.72;
  return topY + (rowHeight + capHeightMm) / 2;
}

interface NutrientRowDef {
  label: string;
  per100: string;
  perPortion: string;
  vd: string;
  bold: boolean;
  indentMm: number;
  strongBottomBorder?: boolean;
}

function buildNutrientRows(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  unitScale: number
): NutrientRowDef[] {
  const { formattedPer100g, formattedPerPortion, percentDailyValue } = nutrition;
  return [
    {
      label: 'Valor energético (kcal)',
      per100: formattedPer100g.energyKcal,
      perPortion: formattedPerPortion.energyKcal,
      vd: String(percentDailyValue.energyKcal ?? 0),
      bold: true,
      indentMm: 0,
      strongBottomBorder: true,
    },
    {
      label: 'Carboidratos (g)',
      per100: formattedPer100g.carbohydrates,
      perPortion: formattedPerPortion.carbohydrates,
      vd: String(percentDailyValue.carbohydrates ?? 0),
      bold: true,
      indentMm: 0,
    },
    {
      label: 'Açúcares totais (g)',
      per100: formattedPer100g.totalSugars,
      perPortion: formattedPerPortion.totalSugars,
      vd: '-',
      bold: false,
      indentMm: 2.2 * unitScale,
    },
    {
      label: 'Açúcares adicionados (g)',
      per100: formattedPer100g.addedSugars,
      perPortion: formattedPerPortion.addedSugars,
      vd: String(percentDailyValue.addedSugars ?? 0),
      bold: false,
      indentMm: 3.8 * unitScale,
    },
    {
      label: 'Proteínas (g)',
      per100: formattedPer100g.proteins,
      perPortion: formattedPerPortion.proteins,
      vd: String(percentDailyValue.proteins ?? 0),
      bold: true,
      indentMm: 0,
    },
    {
      label: 'Gorduras totais (g)',
      per100: formattedPer100g.totalFat,
      perPortion: formattedPerPortion.totalFat,
      vd: String(percentDailyValue.totalFat ?? 0),
      bold: true,
      indentMm: 0,
    },
    {
      label: 'Gorduras saturadas (g)',
      per100: formattedPer100g.saturatedFat,
      perPortion: formattedPerPortion.saturatedFat,
      vd: String(percentDailyValue.saturatedFat ?? 0),
      bold: false,
      indentMm: 2.2 * unitScale,
    },
    {
      label: 'Gorduras trans (g)',
      per100: formattedPer100g.transFat,
      perPortion: formattedPerPortion.transFat,
      // VERIFICAR no modelo de tabela da IN 75 se essa célula é exibida
      vd: String(percentDailyValue.transFat ?? 0),
      bold: false,
      indentMm: 2.2 * unitScale,
    },
    {
      label: 'Fibra alimentar (g)',
      per100: formattedPer100g.dietaryFiber,
      perPortion: formattedPerPortion.dietaryFiber,
      vd: String(percentDailyValue.dietaryFiber ?? 0),
      bold: true,
      indentMm: 0,
    },
    {
      label: 'Sódio (mg)',
      per100: formattedPer100g.sodium,
      perPortion: formattedPerPortion.sodium,
      vd: String(percentDailyValue.sodium ?? 0),
      bold: true,
      indentMm: 0,
    },
  ];
}

function appendBottomDeclarations(
  doc: jsPDF,
  ops: VectorDrawOp[],
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions,
  contentX: number,
  contentW: number,
  startY: number,
  fontPt: number,
  thickLineMm: number
): number {
  const ingredientsText = buildIngredientsListText(recipe.ingredients);
  const { containsSentence, mayContainSentence } = nutrition.allergenStatements;
  const glutenStatement = nutrition.glutenResolution.statement;

  const blocks: { text: string; bold: boolean }[] = [];

  if (options.showIngredients && ingredientsText) {
    blocks.push({ text: `INGREDIENTES: ${ingredientsText}`, bold: false });
  }
  if (options.showAllergens) {
    if (containsSentence) {
      blocks.push({ text: containsSentence.toUpperCase(), bold: true });
    }
    if (mayContainSentence) {
      blocks.push({ text: mayContainSentence.toUpperCase(), bold: true });
    }
    if (nutrition.containsLactose) {
      blocks.push({ text: 'CONTÉM LACTOSE', bold: true });
    }
    if (glutenStatement) {
      blocks.push({ text: glutenStatement.toUpperCase(), bold: true });
    }
  }

  if (blocks.length === 0) {
    return startY;
  }

  let cursorY = startY + 1.2;
  ops.push({
    type: 'line',
    x1: contentX,
    y1: cursorY,
    x2: contentX + contentW,
    y2: cursorY,
    lineWidth: thickLineMm,
    color: '#000000',
  });
  cursorY += 1.6;

  const lh = lineHeightMm(fontPt, 1.3);

  for (const blk of blocks) {
    const lines = measureSplitLines(doc, blk.text, contentW, fontPt, blk.bold);
    for (const ln of lines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, fontPt, lh),
        fontSizePt: fontPt,
        bold: blk.bold,
        align: 'left',
        color: '#000000',
      });
      cursorY += lh;
    }
    cursorY += 0.7;
  }

  return cursorY;
}

/**
 * Constrói o plano vetorial completo da etiqueta no padrão ANVISA (preto sobre branco,
 * fonte Helvetica e dimensões reais em milímetros conforme faixa de área do painel).
 */
export function buildLabelVectorPlan(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): VectorLabelPlan {
  const typography = getTableTypographySpec(recipe.panelArea);
  const scale = typography.bodyFontPt / 8.5;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ops: VectorDrawOp[] = [];

  const unit = recipe.isLiquid ? 'ml' : 'g';
  const portionUnit = `${recipe.portionSize} ${unit}`;

  const clampFont = (pt: number) =>
    Math.min(typography.maxFontPt, Math.max(typography.minFontPt, pt));

  const headerPt = typography.headerFontPt;
  const bodyPt = typography.bodyFontPt;
  const subPt = clampFont(bodyPt - 0.5);
  const footPt = typography.footnoteFontPt;

  const padX = 2.6 * scale;
  const padTop = 2.6 * scale;
  const padBottom = 2.4 * scale;

  let widthMm = 64 * scale;
  if (options.format === 'vertical_broken') {
    widthMm = 116 * scale;
  } else if (options.format === 'horizontal') {
    widthMm = 192 * scale;
  } else if (options.format === 'linear') {
    widthMm = 88 * scale;
  }
  widthMm = Number(widthMm.toFixed(2));

  const contentX = padX;
  const contentW = widthMm - padX * 2;
  let cursorY = padTop;

  // Fundo branco reservado antes da borda externa
  const bgOpIndex = ops.length;
  ops.push({
    type: 'rect',
    x: 0,
    y: 0,
    w: widthMm,
    h: 100, // atualizado ao final
    fill: '#ffffff',
  });

  if (options.format === 'vertical') {
    const hLh = lineHeightMm(headerPt, 1.18);
    ops.push({
      type: 'text',
      text: 'INFORMAÇÃO NUTRICIONAL',
      x: contentX,
      y: baselineFromTop(cursorY, headerPt, hLh),
      fontSizePt: headerPt,
      bold: true,
      align: 'left',
    });
    cursorY += hLh + 0.6;

    const infoLh = lineHeightMm(subPt, 1.25);
    const servingsLines = measureSplitLines(
      doc,
      `Porções por embalagem: ${recipe.servingsPerPackage}`,
      contentW,
      subPt,
      false
    );
    for (const ln of servingsLines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, subPt, infoLh),
        fontSizePt: subPt,
        bold: false,
        align: 'left',
      });
      cursorY += infoLh;
    }

    const portionLines = measureSplitLines(
      doc,
      `Porção: ${portionUnit} (${recipe.householdMeasure})`,
      contentW,
      subPt,
      false
    );
    for (const ln of portionLines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, subPt, infoLh),
        fontSizePt: subPt,
        bold: false,
        align: 'left',
      });
      cursorY += infoLh;
    }

    cursorY += 0.8;
    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thickLineMm,
    });
    cursorY += 0.6;

    // Cabeçalho da tabela
    const col100X = contentX + contentW * 0.63;
    const colPortionX = contentX + contentW * 0.84;
    const colVdX = contentX + contentW;
    const thLh = lineHeightMm(subPt, 1.3);

    ops.push({
      type: 'text',
      text: `100 ${unit}`,
      x: col100X,
      y: baselineFromTop(cursorY, subPt, thLh),
      fontSizePt: subPt,
      bold: true,
      align: 'right',
    });
    ops.push({
      type: 'text',
      text: portionUnit,
      x: colPortionX,
      y: baselineFromTop(cursorY, subPt, thLh),
      fontSizePt: subPt,
      bold: true,
      align: 'right',
    });
    ops.push({
      type: 'text',
      text: '%VD*',
      x: colVdX,
      y: baselineFromTop(cursorY, subPt, thLh),
      fontSizePt: subPt,
      bold: true,
      align: 'right',
    });
    cursorY += thLh;

    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.mediumLineMm,
    });

    const rows = buildNutrientRows(recipe, nutrition, scale);
    const rowLh = lineHeightMm(bodyPt, 1.35);

    rows.forEach((row, idx) => {
      const yBase = baselineFromTop(cursorY, bodyPt, rowLh);
      ops.push({
        type: 'text',
        text: row.label,
        x: contentX + row.indentMm,
        y: yBase,
        fontSizePt: bodyPt,
        bold: row.bold,
        align: 'left',
      });
      ops.push({
        type: 'text',
        text: row.per100,
        x: col100X,
        y: yBase,
        fontSizePt: bodyPt,
        bold: row.strongBottomBorder ? true : false,
        align: 'right',
      });
      ops.push({
        type: 'text',
        text: row.perPortion,
        x: colPortionX,
        y: yBase,
        fontSizePt: bodyPt,
        bold: row.strongBottomBorder ? true : false,
        align: 'right',
      });
      ops.push({
        type: 'text',
        text: row.vd,
        x: colVdX,
        y: yBase,
        fontSizePt: bodyPt,
        bold: row.strongBottomBorder ? true : false,
        align: 'right',
      });

      cursorY += rowLh;
      if (idx < rows.length - 1) {
        ops.push({
          type: 'line',
          x1: contentX,
          y1: cursorY,
          x2: contentX + contentW,
          y2: cursorY,
          lineWidth: row.strongBottomBorder
            ? typography.mediumLineMm
            : typography.thinLineMm,
        });
      }
    });

    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thickLineMm,
    });
    cursorY += 0.8;

    const footLh = lineHeightMm(footPt, 1.25);
    const footLines = measureSplitLines(
      doc,
      '*Percentual de valores diários fornecidos pela porção.',
      contentW,
      footPt,
      false
    );
    for (const ln of footLines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, footPt, footLh),
        fontSizePt: footPt,
        bold: false,
        align: 'left',
      });
      cursorY += footLh;
    }
  } else if (options.format === 'vertical_broken') {
    const hLh = lineHeightMm(headerPt, 1.18);
    ops.push({
      type: 'text',
      text: 'INFORMAÇÃO NUTRICIONAL',
      x: contentX,
      y: baselineFromTop(cursorY, headerPt, hLh),
      fontSizePt: headerPt,
      bold: true,
      align: 'left',
    });
    cursorY += hLh + 0.5;

    const infoLh = lineHeightMm(subPt, 1.25);
    const metaLines = measureSplitLines(
      doc,
      `Porções por embalagem: ${recipe.servingsPerPackage} • Porção: ${portionUnit} (${recipe.householdMeasure})`,
      contentW,
      subPt,
      false
    );
    for (const ln of metaLines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, subPt, infoLh),
        fontSizePt: subPt,
        bold: false,
        align: 'left',
      });
      cursorY += infoLh;
    }

    cursorY += 0.6;
    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thickLineMm,
    });
    cursorY += 0.6;

    const colGap = 3.5 * scale;
    const halfW = (contentW - colGap) / 2;
    const allRows = buildNutrientRows(recipe, nutrition, scale);
    const leftRows = allRows.slice(0, 5);
    const rightRows = allRows.slice(5);

    const thLh = lineHeightMm(footPt, 1.3);
    const rowLh = lineHeightMm(subPt, 1.35);

    const drawHalf = (startX: number, rows: NutrientRowDef[]) => {
      let y = cursorY;
      const c100 = startX + halfW * 0.64;
      const cPor = startX + halfW * 0.84;
      const cVd = startX + halfW;

      ops.push({
        type: 'text',
        text: `100${unit}`,
        x: c100,
        y: baselineFromTop(y, footPt, thLh),
        fontSizePt: footPt,
        bold: true,
        align: 'right',
      });
      ops.push({
        type: 'text',
        text: portionUnit,
        x: cPor,
        y: baselineFromTop(y, footPt, thLh),
        fontSizePt: footPt,
        bold: true,
        align: 'right',
      });
      ops.push({
        type: 'text',
        text: '%VD*',
        x: cVd,
        y: baselineFromTop(y, footPt, thLh),
        fontSizePt: footPt,
        bold: true,
        align: 'right',
      });
      y += thLh;
      ops.push({
        type: 'line',
        x1: startX,
        y1: y,
        x2: startX + halfW,
        y2: y,
        lineWidth: typography.mediumLineMm,
      });

      rows.forEach((row, idx) => {
        const yBase = baselineFromTop(y, subPt, rowLh);
        ops.push({
          type: 'text',
          text: row.label,
          x: startX + row.indentMm * 0.7,
          y: yBase,
          fontSizePt: subPt,
          bold: row.bold,
          align: 'left',
        });
        ops.push({
          type: 'text',
          text: row.per100,
          x: c100,
          y: yBase,
          fontSizePt: subPt,
          bold: Boolean(row.strongBottomBorder),
          align: 'right',
        });
        ops.push({
          type: 'text',
          text: row.perPortion,
          x: cPor,
          y: yBase,
          fontSizePt: subPt,
          bold: Boolean(row.strongBottomBorder),
          align: 'right',
        });
        ops.push({
          type: 'text',
          text: row.vd,
          x: cVd,
          y: yBase,
          fontSizePt: subPt,
          bold: Boolean(row.strongBottomBorder),
          align: 'right',
        });
        y += rowLh;
        if (idx < rows.length - 1) {
          ops.push({
            type: 'line',
            x1: startX,
            y1: y,
            x2: startX + halfW,
            y2: y,
            lineWidth: row.strongBottomBorder
              ? typography.mediumLineMm
              : typography.thinLineMm,
          });
        }
      });
      return y;
    };

    const yLeft = drawHalf(contentX, leftRows);
    const yRight = drawHalf(contentX + halfW + colGap, rightRows);
    cursorY = Math.max(yLeft, yRight);

    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thickLineMm,
    });
    cursorY += 0.8;

    const footLh = lineHeightMm(footPt, 1.25);
    ops.push({
      type: 'text',
      text: '*Percentual de valores diários fornecidos pela porção.',
      x: contentX,
      y: baselineFromTop(cursorY, footPt, footLh),
      fontSizePt: footPt,
      bold: false,
      align: 'left',
    });
    cursorY += footLh;
  } else if (options.format === 'horizontal') {
    const hLh = lineHeightMm(headerPt, 1.18);
    ops.push({
      type: 'text',
      text: 'INFORMAÇÃO NUTRICIONAL',
      x: contentX,
      y: baselineFromTop(cursorY, headerPt, hLh),
      fontSizePt: headerPt,
      bold: true,
      align: 'left',
    });
    ops.push({
      type: 'text',
      text: `Porções por embalagem: ${recipe.servingsPerPackage} | Porção: ${portionUnit} (${recipe.householdMeasure})`,
      x: contentX + contentW,
      y: baselineFromTop(cursorY, subPt, hLh),
      fontSizePt: subPt,
      bold: false,
      align: 'right',
    });
    cursorY += hLh + 0.5;
    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thickLineMm,
    });
    cursorY += 0.5;

    const { formattedPer100g, formattedPerPortion, percentDailyValue } = nutrition;
    const cols = [
      { title: '', v100: `100 ${unit}`, vPor: portionUnit, vd: '%VD*', w: 0.10, bold: true },
      { title: 'Valor energ.', v100: `${formattedPer100g.energyKcal} kcal`, vPor: `${formattedPerPortion.energyKcal} kcal`, vd: `${percentDailyValue.energyKcal ?? 0}%`, w: 0.09, bold: true },
      { title: 'Carboidratos', v100: `${formattedPer100g.carbohydrates} g`, vPor: `${formattedPerPortion.carbohydrates} g`, vd: `${percentDailyValue.carbohydrates ?? 0}%`, w: 0.095, bold: true },
      { title: 'Açúc. tot.', v100: `${formattedPer100g.totalSugars} g`, vPor: `${formattedPerPortion.totalSugars} g`, vd: '-', w: 0.085, bold: false },
      { title: 'Açúc. adic.', v100: `${formattedPer100g.addedSugars} g`, vPor: `${formattedPerPortion.addedSugars} g`, vd: `${percentDailyValue.addedSugars ?? 0}%`, w: 0.085, bold: false },
      { title: 'Proteínas', v100: `${formattedPer100g.proteins} g`, vPor: `${formattedPerPortion.proteins} g`, vd: `${percentDailyValue.proteins ?? 0}%`, w: 0.085, bold: true },
      { title: 'Gord. tot.', v100: `${formattedPer100g.totalFat} g`, vPor: `${formattedPerPortion.totalFat} g`, vd: `${percentDailyValue.totalFat ?? 0}%`, w: 0.085, bold: true },
      { title: 'Gord. sat.', v100: `${formattedPer100g.saturatedFat} g`, vPor: `${formattedPerPortion.saturatedFat} g`, vd: `${percentDailyValue.saturatedFat ?? 0}%`, w: 0.085, bold: false },
      // VERIFICAR no modelo de tabela da IN 75 se essa célula é exibida
      { title: 'Gord. trans', v100: `${formattedPer100g.transFat} g`, vPor: `${formattedPerPortion.transFat} g`, vd: `${percentDailyValue.transFat ?? 0}%`, w: 0.09, bold: false },
      { title: 'Fibra alim.', v100: `${formattedPer100g.dietaryFiber} g`, vPor: `${formattedPerPortion.dietaryFiber} g`, vd: `${percentDailyValue.dietaryFiber ?? 0}%`, w: 0.095, bold: true },
      { title: 'Sódio', v100: `${formattedPer100g.sodium} mg`, vPor: `${formattedPerPortion.sodium} mg`, vd: `${percentDailyValue.sodium ?? 0}%`, w: 0.105, bold: true },
    ];

    const thLh = lineHeightMm(footPt, 1.35);
    const rowLh = lineHeightMm(footPt, 1.35);

    let colX = contentX;
    cols.forEach((c) => {
      const cw = contentW * c.w;
      if (c.title) {
        ops.push({
          type: 'text',
          text: c.title,
          x: colX + cw / 2,
          y: baselineFromTop(cursorY, footPt, thLh),
          fontSizePt: footPt,
          bold: c.bold,
          align: 'center',
        });
      }
      colX += cw;
    });
    cursorY += thLh;
    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.mediumLineMm,
    });

    const rowKeys: Array<'v100' | 'vPor' | 'vd'> = ['v100', 'vPor', 'vd'];
    rowKeys.forEach((key, rIdx) => {
      let cx = contentX;
      cols.forEach((c, cIdx) => {
        const cw = contentW * c.w;
        ops.push({
          type: 'text',
          text: c[key],
          x: cIdx === 0 ? cx : cx + cw / 2,
          y: baselineFromTop(cursorY, footPt, rowLh),
          fontSizePt: footPt,
          bold: cIdx === 0 || key === 'vPor',
          align: cIdx === 0 ? 'left' : 'center',
        });
        cx += cw;
      });
      cursorY += rowLh;
      if (rIdx < rowKeys.length - 1) {
        ops.push({
          type: 'line',
          x1: contentX,
          y1: cursorY,
          x2: contentX + contentW,
          y2: cursorY,
          lineWidth: typography.thinLineMm,
        });
      }
    });

    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thickLineMm,
    });
    cursorY += 0.8;

    const footLh = lineHeightMm(footPt, 1.25);
    ops.push({
      type: 'text',
      text: '*Percentual de valores diários fornecidos pela porção.',
      x: contentX,
      y: baselineFromTop(cursorY, footPt, footLh),
      fontSizePt: footPt,
      bold: false,
      align: 'left',
    });
    cursorY += footLh;
  } else {
    // FORMATO LINEAR
    const hLh = lineHeightMm(headerPt, 1.18);
    ops.push({
      type: 'text',
      text: 'INFORMAÇÃO NUTRICIONAL',
      x: contentX,
      y: baselineFromTop(cursorY, headerPt, hLh),
      fontSizePt: headerPt,
      bold: true,
      align: 'left',
    });
    cursorY += hLh + 0.4;
    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.mediumLineMm,
    });
    cursorY += 0.7;

    const { formattedPer100g, formattedPerPortion, percentDailyValue } = nutrition;
    const infoLh = lineHeightMm(subPt, 1.28);
    const metaLines = measureSplitLines(
      doc,
      `Porções por embalagem: ${recipe.servingsPerPackage} • Porção: ${portionUnit} (${recipe.householdMeasure}).`,
      contentW,
      subPt,
      false
    );
    for (const ln of metaLines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, subPt, infoLh),
        fontSizePt: subPt,
        bold: false,
        align: 'left',
      });
      cursorY += infoLh;
    }
    cursorY += 0.4;

    const linearBody =
      `Por 100 ${unit} (${portionUnit}, %VD*): Valor energético ${formattedPer100g.energyKcal} kcal (${formattedPerPortion.energyKcal} kcal, ${percentDailyValue.energyKcal ?? 0}%) • ` +
      `Carboidratos ${formattedPer100g.carbohydrates} g (${formattedPerPortion.carbohydrates} g, ${percentDailyValue.carbohydrates ?? 0}%), dos quais Açúcares totais ${formattedPer100g.totalSugars} g (${formattedPerPortion.totalSugars} g), Açúcares adicionados ${formattedPer100g.addedSugars} g (${formattedPerPortion.addedSugars} g, ${percentDailyValue.addedSugars ?? 0}%) • ` +
      `Proteínas ${formattedPer100g.proteins} g (${formattedPerPortion.proteins} g, ${percentDailyValue.proteins ?? 0}%) • ` +
      `Gorduras totais ${formattedPer100g.totalFat} g (${formattedPerPortion.totalFat} g, ${percentDailyValue.totalFat ?? 0}%), das quais Gorduras saturadas ${formattedPer100g.saturatedFat} g (${formattedPerPortion.saturatedFat} g, ${percentDailyValue.saturatedFat ?? 0}%), Gorduras trans ${formattedPer100g.transFat} g (${formattedPerPortion.transFat} g) • ` +
      `Fibra alimentar ${formattedPer100g.dietaryFiber} g (${formattedPerPortion.dietaryFiber} g, ${percentDailyValue.dietaryFiber ?? 0}%) • ` +
      `Sódio ${formattedPer100g.sodium} mg (${formattedPerPortion.sodium} mg, ${percentDailyValue.sodium ?? 0}%).`;

    const bodyLh = lineHeightMm(footPt, 1.3);
    const bodyLines = measureSplitLines(doc, linearBody, contentW, footPt, false);
    for (const ln of bodyLines) {
      ops.push({
        type: 'text',
        text: ln,
        x: contentX,
        y: baselineFromTop(cursorY, footPt, bodyLh),
        fontSizePt: footPt,
        bold: false,
        align: 'left',
      });
      cursorY += bodyLh;
    }

    cursorY += 0.5;
    ops.push({
      type: 'line',
      x1: contentX,
      y1: cursorY,
      x2: contentX + contentW,
      y2: cursorY,
      lineWidth: typography.thinLineMm,
    });
    cursorY += 0.6;
    ops.push({
      type: 'text',
      text: '*Percentual de valores diários fornecidos pela porção.',
      x: contentX,
      y: baselineFromTop(cursorY, footPt, bodyLh),
      fontSizePt: footPt,
      bold: false,
      align: 'left',
    });
    cursorY += bodyLh;
  }

  // Ingredientes, alergênicos, lactose e glúten
  cursorY = appendBottomDeclarations(
    doc,
    ops,
    recipe,
    nutrition,
    options,
    contentX,
    contentW,
    cursorY,
    footPt,
    typography.thickLineMm
  );

  const heightMm = Number((cursorY + padBottom).toFixed(2));
  (ops[bgOpIndex] as Extract<VectorDrawOp, { type: 'rect' }>).h = heightMm;

  // Borda externa preta da etiqueta
  const borderW = typography.thickLineMm;
  ops.push({
    type: 'rect',
    x: borderW / 2,
    y: borderW / 2,
    w: widthMm - borderW,
    h: heightMm - borderW,
    stroke: '#000000',
    lineWidth: borderW,
  });

  return {
    widthMm,
    heightMm,
    ops,
    typography,
  };
}

function renderOpsToPdf(
  doc: jsPDF,
  ops: VectorDrawOp[],
  offsetX: number,
  offsetY: number
): void {
  for (const op of ops) {
    if (op.type === 'rect') {
      if (op.fill && op.stroke) {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(op.lineWidth ?? 0.3);
        doc.rect(offsetX + op.x, offsetY + op.y, op.w, op.h, 'FD');
      } else if (op.fill) {
        doc.setFillColor(255, 255, 255);
        doc.rect(offsetX + op.x, offsetY + op.y, op.w, op.h, 'F');
      } else if (op.stroke) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(op.lineWidth ?? 0.3);
        doc.rect(offsetX + op.x, offsetY + op.y, op.w, op.h, 'S');
      }
    } else if (op.type === 'line') {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(op.lineWidth);
      doc.line(
        offsetX + op.x1,
        offsetY + op.y1,
        offsetX + op.x2,
        offsetY + op.y2
      );
    } else if (op.type === 'text') {
      doc.setTextColor(0, 0, 0);
      doc.setFont('helvetica', op.bold ? 'bold' : 'normal');
      doc.setFontSize(op.fontSizePt);
      doc.text(op.text, offsetX + op.x, offsetY + op.y, {
        align: op.align ?? 'left',
      });
    }
  }
}

function drawCropMarks(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  offsetMm = 1,
  markLenMm = 3.5
): void {
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.15);

  // Canto superior esquerdo
  doc.line(x - offsetMm - markLenMm, y, x - offsetMm, y);
  doc.line(x, y - offsetMm - markLenMm, x, y - offsetMm);

  // Canto superior direito
  doc.line(x + w + offsetMm, y, x + w + offsetMm + markLenMm, y);
  doc.line(x + w, y - offsetMm - markLenMm, x + w, y - offsetMm);

  // Canto inferior esquerdo
  doc.line(x - offsetMm - markLenMm, y + h, x - offsetMm, y + h);
  doc.line(x, y + h + offsetMm, x, y + h + offsetMm + markLenMm);

  // Canto inferior direito
  doc.line(x + w + offsetMm, y + h, x + w + offsetMm + markLenMm, y + h);
  doc.line(x + w, y + h + offsetMm, x + w, y + h + offsetMm + markLenMm);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function serializeLabelPlanToSvg(
  plan: VectorLabelPlan,
  pixelSize?: { widthPx: number; heightPx: number }
): string {
  const widthAttr = pixelSize ? `${pixelSize.widthPx}` : `${plan.widthMm}mm`;
  const heightAttr = pixelSize ? `${pixelSize.heightPx}` : `${plan.heightMm}mm`;

  const elements = plan.ops
    .map((op) => {
      if (op.type === 'rect') {
        const fill = op.fill ?? 'none';
        const stroke = op.stroke ?? 'none';
        const sw = op.lineWidth ?? 0;
        return `<rect x="${op.x.toFixed(3)}" y="${op.y.toFixed(3)}" width="${op.w.toFixed(3)}" height="${op.h.toFixed(3)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw.toFixed(3)}" />`;
      }
      if (op.type === 'line') {
        return `<line x1="${op.x1.toFixed(3)}" y1="${op.y1.toFixed(3)}" x2="${op.x2.toFixed(3)}" y2="${op.y2.toFixed(3)}" stroke="${op.color ?? '#000000'}" stroke-width="${op.lineWidth.toFixed(3)}" />`;
      }
      const fontMm = op.fontSizePt * PT_TO_MM;
      const anchor =
        op.align === 'right' ? 'end' : op.align === 'center' ? 'middle' : 'start';
      const weight = op.bold ? '700' : '400';
      return `<text x="${op.x.toFixed(3)}" y="${op.y.toFixed(3)}" fill="${op.color ?? '#000000'}" font-family="Helvetica, Arial, sans-serif" font-weight="${weight}" font-size="${fontMm.toFixed(4)}" text-anchor="${anchor}">${escapeXml(op.text)}</text>`;
    })
    .join('\n  ');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${widthAttr}" height="${heightAttr}" viewBox="0 0 ${plan.widthMm} ${plan.heightMm}">\n  ${elements}\n</svg>`;
}

/**
 * Cria o documento jsPDF vetorial 1:1 (uma etiqueta por página no tamanho exato em mm).
 */
export function buildSingleLabelVectorPdf(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): { pdf: jsPDF; plan: VectorLabelPlan } {
  const plan = buildLabelVectorPlan(recipe, nutrition, options);
  const pdf = new jsPDF({
    orientation: plan.widthMm > plan.heightMm ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [plan.widthMm, plan.heightMm],
  });
  renderOpsToPdf(pdf, plan.ops, 0, 0);
  return { pdf, plan };
}

/**
 * Cria o documento jsPDF vetorial em folha A4 com várias etiquetas e marcas de corte.
 */
export function buildA4SheetVectorPdf(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): { pdf: jsPDF; plan: VectorLabelPlan; layout: A4SheetLayout } {
  const plan = buildLabelVectorPlan(recipe, nutrition, options);
  const layout = computeA4SheetLayout(plan.widthMm, plan.heightMm);

  const pdf = new jsPDF({
    orientation: layout.orientation,
    unit: 'mm',
    format: 'a4',
  });

  for (const pos of layout.placements) {
    renderOpsToPdf(pdf, plan.ops, pos.x, pos.y);
    drawCropMarks(pdf, pos.x, pos.y, plan.widthMm, plan.heightMm);
  }

  return { pdf, plan, layout };
}

export function exportLabelAsVectorPdfSingle(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): VectorLabelPlan {
  const { pdf, plan } = buildSingleLabelVectorPdf(recipe, nutrition, options);
  const safeName = buildSafeFilename(recipe.name);
  pdf.save(`rotulo_anvisa_${safeName}.pdf`);
  return plan;
}

export function exportLabelAsVectorPdfA4Sheet(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): { plan: VectorLabelPlan; count: number } {
  const { pdf, plan, layout } = buildA4SheetVectorPdf(recipe, nutrition, options);
  const safeName = buildSafeFilename(recipe.name);
  pdf.save(`rotulo_anvisa_${safeName}_a4_corte.pdf`);
  return { plan, count: layout.placements.length };
}

export function exportLabelAsSvg(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): VectorLabelPlan {
  const plan = buildLabelVectorPlan(recipe, nutrition, options);
  const svgText = serializeLabelPlanToSvg(plan);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const safeName = buildSafeFilename(recipe.name);
  const link = document.createElement('a');
  link.href = url;
  link.download = `rotulo_anvisa_${safeName}.svg`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return plan;
}

function loadSvgImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export async function exportLabelAsPng600Dpi(
  recipe: Recipe,
  nutrition: CalculatedNutrition,
  options: LabelExportOptions
): Promise<{ widthPx: number; heightPx: number; plan: VectorLabelPlan }> {
  const plan = buildLabelVectorPlan(recipe, nutrition, options);
  const { widthPx, heightPx } = compute600DpiPixels(plan.widthMm, plan.heightMm);
  const svgText = serializeLabelPlanToSvg(plan, { widthPx, heightPx });
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const img = await loadSvgImage(svgUrl);
    const canvas = document.createElement('canvas');
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto 2D indisponível para gerar PNG.');
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    const pngUrl = canvas.toDataURL('image/png', 1.0);
    const safeName = buildSafeFilename(recipe.name);
    const link = document.createElement('a');
    link.download = `rotulo_anvisa_${safeName}_600dpi.png`;
    link.href = pngUrl;
    link.click();

    return { widthPx, heightPx, plan };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
