/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  ANVISA_TABLE_TYPOGRAPHY_BY_AREA,
  getTableTypographySpec,
} from './anvisaRules';
import { calculateRecipeNutrition } from './nutritionCalculator';
import {
  buildA4SheetVectorPdf,
  buildLabelVectorPlan,
  buildSingleLabelVectorPdf,
  compute600DpiPixels,
  computeA4SheetLayout,
  serializeLabelPlanToSvg,
} from './exportLabel';
import { SAMPLE_RECIPES } from '../data/sampleRecipes';

describe('Etapa 6 - Exportação vetorial para gráfica (IN 75/2020)', () => {
  const sampleRecipe = {
    ...SAMPLE_RECIPES[0],
    panelArea: 150,
    glutenStatus: 'contains' as const,
  };
  const sampleNutrition = calculateRecipeNutrition(sampleRecipe);

  it('aplica constantes de fonte mínima/máxima e espessura de linha por faixa de área do painel', () => {
    expect(ANVISA_TABLE_TYPOGRAPHY_BY_AREA.length).toBeGreaterThanOrEqual(7);

    const small = getTableTypographySpec(30);
    expect(small.minFontPt).toBe(6);
    expect(small.thinLineMm).toBe(0.15);

    const medium = getTableTypographySpec(150);
    expect(medium.minFontPt).toBe(8);
    expect(medium.maxFontPt).toBe(12);
    expect(medium.thickLineMm).toBe(0.65);

    const large = getTableTypographySpec(1800);
    expect(large.minFontPt).toBe(10);
    expect(large.maxFontPt).toBe(18);
    expect(large.thickLineMm).toBe(0.95);
  });

  it('gera plano vetorial e PDF 1:1 em mm sem imagem PNG, sem cabeçalho extra e em Helvetica', () => {
    for (const format of ['vertical', 'vertical_broken', 'horizontal', 'linear'] as const) {
      const plan = buildLabelVectorPlan(sampleRecipe, sampleNutrition, {
        format,
        showIngredients: true,
        showAllergens: true,
      });

      expect(plan.widthMm).toBeGreaterThan(20);
      expect(plan.heightMm).toBeGreaterThan(20);

      const textOps = plan.ops.filter((op) => op.type === 'text');
      expect(textOps.length).toBeGreaterThan(5);
      for (const op of textOps) {
        if (op.type === 'text') {
          expect(op.fontSizePt).toBeGreaterThanOrEqual(plan.typography.minFontPt);
          expect(op.fontSizePt).toBeLessThanOrEqual(plan.typography.maxFontPt);
          expect(op.text).not.toMatch(/Rótulo Nutricional\s*[–-]\s*Padrão ANVISA/i);
        }
      }

      const { pdf } = buildSingleLabelVectorPdf(sampleRecipe, sampleNutrition, {
        format,
        showIngredients: true,
        showAllergens: true,
      });

      expect(pdf.getNumberOfPages()).toBe(1);
      const pageSize = pdf.internal.pageSize;
      expect(pageSize.getWidth()).toBeCloseTo(plan.widthMm, 1);
      expect(pageSize.getHeight()).toBeCloseTo(plan.heightMm, 1);

      const rawPdf = pdf.output('datauristring');
      expect(rawPdf.startsWith('data:application/pdf')).toBe(true);
      const pdfBytes = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
      expect(pdfBytes).toContain('Helvetica');
      expect(pdfBytes).not.toContain('/Subtype /Image');
    }
  });

  it('calcula grade em folha A4 com múltiplas etiquetas e marcas de corte vetoriais', () => {
    const plan = buildLabelVectorPlan(sampleRecipe, sampleNutrition, {
      format: 'vertical',
      showIngredients: true,
      showAllergens: true,
    });
    const layout = computeA4SheetLayout(plan.widthMm, plan.heightMm);
    expect(layout.cols).toBeGreaterThanOrEqual(2);
    expect(layout.rows).toBeGreaterThanOrEqual(2);
    expect(layout.placements.length).toBe(layout.cols * layout.rows);

    const { pdf } = buildA4SheetVectorPdf(sampleRecipe, sampleNutrition, {
      format: 'vertical',
      showIngredients: true,
      showAllergens: true,
    });
    expect(pdf.getNumberOfPages()).toBe(1);
    const pdfBytes = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
    expect(pdfBytes).not.toContain('/Subtype /Image');
  });

  it('calcula PNG em 600 DPI exato a partir das dimensões em milímetros e serializa SVG vetorial', () => {
    expect(compute600DpiPixels(25.4, 50.8)).toEqual({
      widthPx: 600,
      heightPx: 1200,
    });

    const plan = buildLabelVectorPlan(sampleRecipe, sampleNutrition, {
      format: 'vertical',
      showIngredients: true,
      showAllergens: true,
    });
    const svg = serializeLabelPlanToSvg(plan);
    expect(svg).toContain(`width="${plan.widthMm}mm"`);
    expect(svg).toContain(`height="${plan.heightMm}mm"`);
    expect(svg).toContain('INFORMAÇÃO NUTRICIONAL');
    expect(svg).toContain('Helvetica, Arial, sans-serif');
  });
});
