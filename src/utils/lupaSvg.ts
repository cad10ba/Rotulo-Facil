/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getFrontalMagnifierDimensions } from './anvisaRules';

export interface LupaWarnings {
  highAddedSugar: boolean;
  highSaturatedFat: boolean;
  highSodium: boolean;
}

export interface HorizontalSpan {
  xMin: number;
  xMax: number;
}

export interface LupaTextLineLayout {
  text: string;
  x: number;
  y: number;
  textLength: number;
  fontSize: number;
  bounds: HorizontalSpan;
}

export interface LupaNutrientBlockLayout {
  key: 'sugar' | 'satFat' | 'sodium';
  x: number;
  y: number;
  width: number;
  height: number;
  isLast: boolean;
  bounds: HorizontalSpan;
  lines: LupaTextLineLayout[];
}

export interface LupaLayout {
  totalWidth: number;
  height: number;
  pad: number;
  innerH: number;
  widthMm: number;
  heightMm: number;
  ariaLabel: string;
  magnifier: {
    cx: number;
    cy: number;
    r: number;
    strokeWidth: number;
    handleX1: number;
    handleY1: number;
    handleX2: number;
    handleY2: number;
    bounds: HorizontalSpan & { yMin: number; yMax: number };
  };
  altoEm: {
    x: number;
    y: number;
    textLength: number;
    fontSize: number;
    boxWidth: number;
    bounds: HorizontalSpan;
  };
  blocks: LupaNutrientBlockLayout[];
}

/**
 * Proporções geométricas do modelo SVG da Rotulagem Nutricional Frontal (Anexo XVII da IN 75/2020).
 * Todas as medidas estão em unidades proporcionais do viewBox (base altura = 100),
 * organizadas em zonas disjuntas com folga fixa entre lupa, "ALTO EM" e blocos de nutrientes.
 * // VERIFICAR com o modelo oficial
 */
export const LUPA_SVG_PROPORTIONS = {
  // VERIFICAR com o modelo oficial: altura total do selo no viewBox
  viewBoxHeight: 100,
  // VERIFICAR com o modelo oficial: espessura da borda externa e raio dos cantos arredondados
  borderWidth: 3.5,
  outerCornerRadius: 14,
  innerCornerRadius: 11,
  // Zona 1: Símbolo da Lupa (xMin ~ 10.7 .. xMax ~ 43.3)
  magnifierCx: 25,
  magnifierCy: 43,
  magnifierRadius: 12,
  magnifierStrokeWidth: 4.6,
  magnifierHandleX2: 41,
  magnifierHandleY2: 60.5,
  // Zona 2: Texto "ALTO EM" (xMin = 51 .. xMax = 117), gap >= 7.7 da lupa e >= 9 do bloco preto
  altoEmBoxWidth: 126,
  altoEmTextX: 84,
  altoEmTextY: 50,
  altoEmTextLength: 66,
  altoEmFontSize: 21,
  altoEmLetterSpacing: 0.2,
  // Zona 3: Blocos pretos individuais de nutrientes
  blockGap: 3.5,
  blockInnerPaddingX: 8,
  nutrientBoxWidths: {
    sugar: 108,
    satFat: 108,
    sodium: 80,
  },
  nutrientLineTextLengths: {
    sugarLine1: 66,
    sugarLine2: 88,
    satFatLine1: 74,
    satFatLine2: 82,
    sodiumLine1: 52,
  },
  // Família tipográfica com fallback condensado/padrão seguro
  fontFamily: "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif",
  nutrientFontSize: 17.5,
  nutrientTwoLineOffset: 11,
  nutrientLetterSpacing: 0.15,
} as const;

interface RawBlockDef {
  key: 'sugar' | 'satFat' | 'sodium';
  width: number;
  lines: Array<{ text: string; textLength: number }>;
}

export function computeLupaLayout(
  warnings: LupaWarnings,
  panelArea?: number
): LupaLayout | null {
  const P = LUPA_SVG_PROPORTIONS;
  const rawBlocks: RawBlockDef[] = [];

  if (warnings.highAddedSugar) {
    rawBlocks.push({
      key: 'sugar',
      width: P.nutrientBoxWidths.sugar,
      lines: [
        { text: 'AÇÚCAR', textLength: P.nutrientLineTextLengths.sugarLine1 },
        { text: 'ADICIONADO', textLength: P.nutrientLineTextLengths.sugarLine2 },
      ],
    });
  }
  if (warnings.highSaturatedFat) {
    rawBlocks.push({
      key: 'satFat',
      width: P.nutrientBoxWidths.satFat,
      lines: [
        { text: 'GORDURA', textLength: P.nutrientLineTextLengths.satFatLine1 },
        { text: 'SATURADA', textLength: P.nutrientLineTextLengths.satFatLine2 },
      ],
    });
  }
  if (warnings.highSodium) {
    rawBlocks.push({
      key: 'sodium',
      width: P.nutrientBoxWidths.sodium,
      lines: [{ text: 'SÓDIO', textLength: P.nutrientLineTextLengths.sodiumLine1 }],
    });
  }

  if (rawBlocks.length === 0) {
    return null;
  }

  const dims = getFrontalMagnifierDimensions(panelArea);
  const H = P.viewBoxHeight;
  const pad = P.borderWidth;
  const innerH = H - pad * 2;
  const blocksTotalWidth =
    rawBlocks.reduce((acc, b) => acc + b.width, 0) +
    Math.max(0, rawBlocks.length - 1) * P.blockGap;
  const totalWidth = P.altoEmBoxWidth + blocksTotalWidth + pad;
  const widthMm = Number(((dims.heightMm * totalWidth) / H).toFixed(2));

  const halfStroke = P.magnifierStrokeWidth / 2;
  const handleX1 = P.magnifierCx + P.magnifierRadius * Math.SQRT1_2;
  const handleY1 = P.magnifierCy + P.magnifierRadius * Math.SQRT1_2;
  const magnifierBounds = {
    xMin: Number((P.magnifierCx - P.magnifierRadius - halfStroke).toFixed(2)),
    xMax: Number(
      Math.max(
        P.magnifierCx + P.magnifierRadius + halfStroke,
        P.magnifierHandleX2 + halfStroke
      ).toFixed(2)
    ),
    yMin: Number((P.magnifierCy - P.magnifierRadius - halfStroke).toFixed(2)),
    yMax: Number(
      Math.max(
        P.magnifierCy + P.magnifierRadius + halfStroke,
        P.magnifierHandleY2 + halfStroke
      ).toFixed(2)
    ),
  };

  const altoEmBounds: HorizontalSpan = {
    xMin: Number((P.altoEmTextX - P.altoEmTextLength / 2).toFixed(2)),
    xMax: Number((P.altoEmTextX + P.altoEmTextLength / 2).toFixed(2)),
  };

  let cursorX = P.altoEmBoxWidth;
  const centerY = H / 2;

  const blocks: LupaNutrientBlockLayout[] = rawBlocks.map((def, index) => {
    const blockX = cursorX;
    cursorX += def.width + P.blockGap;
    const isLast = index === rawBlocks.length - 1;
    const blockCenterX = blockX + def.width / 2;

    const lines: LupaTextLineLayout[] =
      def.lines.length === 1
        ? [
            {
              text: def.lines[0].text,
              x: blockCenterX,
              y: centerY,
              textLength: def.lines[0].textLength,
              fontSize: P.nutrientFontSize,
              bounds: {
                xMin: Number((blockCenterX - def.lines[0].textLength / 2).toFixed(2)),
                xMax: Number((blockCenterX + def.lines[0].textLength / 2).toFixed(2)),
              },
            },
          ]
        : [
            {
              text: def.lines[0].text,
              x: blockCenterX,
              y: centerY - P.nutrientTwoLineOffset,
              textLength: def.lines[0].textLength,
              fontSize: P.nutrientFontSize,
              bounds: {
                xMin: Number((blockCenterX - def.lines[0].textLength / 2).toFixed(2)),
                xMax: Number((blockCenterX + def.lines[0].textLength / 2).toFixed(2)),
              },
            },
            {
              text: def.lines[1].text,
              x: blockCenterX,
              y: centerY + P.nutrientTwoLineOffset,
              textLength: def.lines[1].textLength,
              fontSize: P.nutrientFontSize,
              bounds: {
                xMin: Number((blockCenterX - def.lines[1].textLength / 2).toFixed(2)),
                xMax: Number((blockCenterX + def.lines[1].textLength / 2).toFixed(2)),
              },
            },
          ];

    return {
      key: def.key,
      x: blockX,
      y: pad,
      width: def.width,
      height: innerH,
      isLast,
      bounds: {
        xMin: blockX,
        xMax: blockX + def.width,
      },
      lines,
    };
  });

  const ariaLabel = `Alto em ${rawBlocks
    .map((b) => b.lines.map((l) => l.text).join(' '))
    .join(', ')}`;

  return {
    totalWidth,
    height: H,
    pad,
    innerH,
    widthMm,
    heightMm: dims.heightMm,
    ariaLabel,
    magnifier: {
      cx: P.magnifierCx,
      cy: P.magnifierCy,
      r: P.magnifierRadius,
      strokeWidth: P.magnifierStrokeWidth,
      handleX1,
      handleY1,
      handleX2: P.magnifierHandleX2,
      handleY2: P.magnifierHandleY2,
      bounds: magnifierBounds,
    },
    altoEm: {
      x: P.altoEmTextX,
      y: P.altoEmTextY,
      textLength: P.altoEmTextLength,
      fontSize: P.altoEmFontSize,
      boxWidth: P.altoEmBoxWidth,
      bounds: altoEmBounds,
    },
    blocks,
  };
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildLupaSvgString(
  warnings: LupaWarnings,
  panelArea?: number,
  svgId = 'anvisa-frontal-magnifier-svg'
): string | null {
  const layout = computeLupaLayout(warnings, panelArea);
  if (!layout) return null;

  const P = LUPA_SVG_PROPORTIONS;
  const fontAttr = escapeXmlAttr(P.fontFamily);
  const ariaAttr = escapeXmlAttr(layout.ariaLabel);
  const idAttr = escapeXmlAttr(svgId);

  const blocksMarkup = layout.blocks
    .map((block) => {
      const rx = block.isLast ? P.innerCornerRadius : 2;
      const leftSquarePatch = !block.isLast
        ? `<rect x="${block.x}" y="${block.y}" width="${Math.min(12, block.width / 3)}" height="${block.height}" fill="#000000" />`
        : '';
      const lastInnerLeftPatch =
        block.isLast && layout.blocks.length > 1
          ? `<rect x="${block.x}" y="${block.y}" width="${P.innerCornerRadius}" height="${block.height}" fill="#000000" />`
          : '';
      const textsMarkup = block.lines
        .map(
          (line) =>
            `<text x="${line.x}" y="${line.y}" fill="#ffffff" font-family="${fontAttr}" font-weight="700" font-size="${line.fontSize}" letter-spacing="${P.nutrientLetterSpacing}" text-anchor="middle" dominant-baseline="central" textLength="${line.textLength}" lengthAdjust="spacingAndGlyphs">${escapeXmlAttr(line.text)}</text>`
        )
        .join('');

      return `<g data-lupa-block="${block.key}"><rect x="${block.x}" y="${block.y}" width="${block.width}" height="${block.height}" rx="${rx}" ry="${rx}" fill="#000000" />${leftSquarePatch}${lastInnerLeftPatch}${textsMarkup}</g>`;
    })
    .join('');

  return `<svg id="${idAttr}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${layout.totalWidth} ${layout.height}" width="${layout.widthMm}mm" height="${layout.heightMm}mm" data-width-mm="${layout.widthMm}" data-height-mm="${layout.heightMm}" role="img" aria-label="${ariaAttr}"><rect x="${layout.pad / 2}" y="${layout.pad / 2}" width="${layout.totalWidth - layout.pad}" height="${layout.height - layout.pad}" rx="${P.outerCornerRadius}" ry="${P.outerCornerRadius}" fill="#ffffff" stroke="#000000" stroke-width="${P.borderWidth}" /><g data-lupa-zone="header"><circle cx="${layout.magnifier.cx}" cy="${layout.magnifier.cy}" r="${layout.magnifier.r}" fill="none" stroke="#000000" stroke-width="${layout.magnifier.strokeWidth}" /><line x1="${layout.magnifier.handleX1}" y1="${layout.magnifier.handleY1}" x2="${layout.magnifier.handleX2}" y2="${layout.magnifier.handleY2}" stroke="#000000" stroke-width="${layout.magnifier.strokeWidth}" stroke-linecap="round" /><text x="${layout.altoEm.x}" y="${layout.altoEm.y}" fill="#000000" font-family="${fontAttr}" font-weight="700" font-size="${layout.altoEm.fontSize}" letter-spacing="${P.altoEmLetterSpacing}" text-anchor="middle" dominant-baseline="central" textLength="${layout.altoEm.textLength}" lengthAdjust="spacingAndGlyphs">ALTO EM</text></g>${blocksMarkup}</svg>`;
}
