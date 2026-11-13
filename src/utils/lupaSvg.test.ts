/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  LupaWarnings,
  buildLupaSvgString,
  computeLupaLayout,
} from './lupaSvg';

const ALL_SEVEN_COMBINATIONS: Array<{ name: string; warnings: LupaWarnings }> = [
  {
    name: '1 nutriente: Açúcar Adicionado',
    warnings: { highAddedSugar: true, highSaturatedFat: false, highSodium: false },
  },
  {
    name: '1 nutriente: Gordura Saturada',
    warnings: { highAddedSugar: false, highSaturatedFat: true, highSodium: false },
  },
  {
    name: '1 nutriente: Sódio',
    warnings: { highAddedSugar: false, highSaturatedFat: false, highSodium: true },
  },
  {
    name: '2 nutrientes: Açúcar + Gordura Saturada',
    warnings: { highAddedSugar: true, highSaturatedFat: true, highSodium: false },
  },
  {
    name: '2 nutrientes: Açúcar + Sódio',
    warnings: { highAddedSugar: true, highSaturatedFat: false, highSodium: true },
  },
  {
    name: '2 nutrientes: Gordura Saturada + Sódio',
    warnings: { highAddedSugar: false, highSaturatedFat: true, highSodium: true },
  },
  {
    name: '3 nutrientes: Açúcar + Gordura Saturada + Sódio',
    warnings: { highAddedSugar: true, highSaturatedFat: true, highSodium: true },
  },
];

describe('Lupa Frontal ANVISA (layout sem sobreposição nas 7 combinações)', () => {
  it('retorna null quando nenhum nutriente atinge limite', () => {
    const empty: LupaWarnings = {
      highAddedSugar: false,
      highSaturatedFat: false,
      highSodium: false,
    };
    expect(computeLupaLayout(empty, 150)).toBeNull();
    expect(buildLupaSvgString(empty, 150)).toBeNull();
  });

  it.each(ALL_SEVEN_COMBINATIONS)(
    'gera SVG válido sem sobreposição para $name',
    ({ warnings }) => {
      const layout = computeLupaLayout(warnings, 150);
      const svg = buildLupaSvgString(warnings, 150);

      expect(layout).not.toBeNull();
      expect(svg).not.toBeNull();
      if (!layout || !svg) return;

      // 1. Zonas horizontais disjuntas: Lupa < "ALTO EM" < primeiro bloco preto
      expect(layout.magnifier.bounds.xMax).toBeLessThan(layout.altoEm.bounds.xMin);
      expect(layout.altoEm.bounds.xMin - layout.magnifier.bounds.xMax).toBeGreaterThanOrEqual(5);

      const firstBlock = layout.blocks[0];
      expect(layout.altoEm.bounds.xMax).toBeLessThan(firstBlock.bounds.xMin);
      expect(firstBlock.bounds.xMin - layout.altoEm.bounds.xMax).toBeGreaterThanOrEqual(5);

      // 2. Blocos de nutrientes não se sobrepõem e textos cabem dentro dos blocos
      for (let i = 0; i < layout.blocks.length; i++) {
        const block = layout.blocks[i];
        if (i > 0) {
          const prevBlock = layout.blocks[i - 1];
          expect(block.bounds.xMin).toBeGreaterThan(prevBlock.bounds.xMax);
        }

        for (const line of block.lines) {
          expect(line.bounds.xMin).toBeGreaterThanOrEqual(block.bounds.xMin + 6);
          expect(line.bounds.xMax).toBeLessThanOrEqual(block.bounds.xMax - 6);
        }
      }

      // 3. Blocos permanecem dentro da largura total com margem para a borda externa
      const lastBlock = layout.blocks[layout.blocks.length - 1];
      expect(lastBlock.bounds.xMax).toBeLessThanOrEqual(layout.totalWidth - layout.pad);

      // 4. SVG contém textLength, lengthAdjust="spacingAndGlyphs" e fallback de fonte segura
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('Roboto Condensed');
      expect(svg).toContain('Arial');
      expect(svg).toContain('ALTO EM');

      const textMatches = [...svg.matchAll(/<text\b([^>]*)>/g)];
      const expectedTextCount =
        1 + layout.blocks.reduce((sum, block) => sum + block.lines.length, 0);
      expect(textMatches).toHaveLength(expectedTextCount);

      for (const match of textMatches) {
        const attrs = match[1];
        expect(attrs).toMatch(/textLength="\d+(?:\.\d+)?"/);
        expect(attrs).toContain('lengthAdjust="spacingAndGlyphs"');
      }
    }
  );
});
