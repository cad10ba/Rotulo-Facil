/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { getFrontalMagnifierDimensions } from '../utils/anvisaRules';

/**
 * Proporções geométricas do modelo SVG da Rotulagem Nutricional Frontal (Anexo XVII da IN 75/2020).
 * Todas as medidas estão em unidades proporcionais do viewBox (base altura = 100).
 * // VERIFICAR com o modelo oficial
 */
export const LUPA_SVG_PROPORTIONS = {
  // VERIFICAR com o modelo oficial: altura total do selo no viewBox
  viewBoxHeight: 100,
  // VERIFICAR com o modelo oficial: espessura da borda externa e raio dos cantos arredondados
  borderWidth: 3.5,
  outerCornerRadius: 14,
  innerCornerRadius: 11,
  // VERIFICAR com o modelo oficial: largura do bloco branco esquerdo ("Lupa + ALTO EM")
  altoEmBoxWidth: 112,
  // VERIFICAR com o modelo oficial: espaçamento (filete branco) entre blocos pretos de nutrientes
  blockGap: 3.5,
  // VERIFICAR com o modelo oficial: largura de cada bloco preto de nutriente
  nutrientBoxWidths: {
    sugar: 106,
    satFat: 106,
    sodium: 78,
  },
  // VERIFICAR com o modelo oficial: geometria do ícone da lupa em SVG (lente + cabo)
  magnifierCx: 27,
  magnifierCy: 44,
  magnifierRadius: 13.5,
  magnifierStrokeWidth: 5.2,
  magnifierHandleX2: 43.5,
  magnifierHandleY2: 61.5,
  // VERIFICAR com o modelo oficial: família tipográfica e tamanhos proporcionais ("ALTO EM" e nutrientes)
  fontFamily: "'Arial Narrow', 'Nimbus Sans Narrow', Arial, sans-serif",
  altoEmTextX: 77,
  altoEmTextY: 50,
  altoEmFontSize: 22,
  altoEmLetterSpacing: 0.3,
  nutrientFontSize: 17.5,
  nutrientTwoLineOffset: 10.5,
  nutrientLetterSpacing: 0.2,
} as const;

interface NutrientBlockDef {
  key: 'sugar' | 'satFat' | 'sodium';
  lines: string[];
  width: number;
}

interface FrontalMagnifierProps {
  warnings: {
    highAddedSugar: boolean;
    highSaturatedFat: boolean;
    highSodium: boolean;
  };
  panelArea?: number;
  svgId?: string;
}

let cachedLupaFilesPromise: Promise<string[]> | null = null;

function fetchAvailableLupaAssets(): Promise<string[]> {
  if (!cachedLupaFilesPromise) {
    cachedLupaFilesPromise = fetch('/api/lupa/assets')
      .then((res) => (res.ok ? res.json() : { files: [] }))
      .then((data) => (Array.isArray(data?.files) ? (data.files as string[]) : []))
      .catch(() => []);
  }
  return cachedLupaFilesPromise;
}

function normalizeToken(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resolveMatchingLupaAsset(
  files: string[],
  warnings: FrontalMagnifierProps['warnings']
): string | null {
  if (!files || files.length === 0) return null;

  const matches = files.filter((file) => {
    const base = normalizeToken(file.replace(/\.[^.]+$/, ''));
    const hasSugar = base.includes('acucar');
    const hasFat = base.includes('gordura');
    const hasSodium = base.includes('sodio');
    return (
      hasSugar === warnings.highAddedSugar &&
      hasFat === warnings.highSaturatedFat &&
      hasSodium === warnings.highSodium
    );
  });

  if (matches.length === 0) return null;
  const svgMatch = matches.find((f) => f.toLowerCase().endsWith('.svg'));
  return svgMatch || matches[0];
}

export const FrontalMagnifier: React.FC<FrontalMagnifierProps> = ({
  warnings,
  panelArea,
  svgId = 'anvisa-frontal-magnifier-svg',
}) => {
  const [customAssetFile, setCustomAssetFile] = useState<string | null>(null);

  const activeBlocks: NutrientBlockDef[] = [];
  if (warnings.highAddedSugar) {
    activeBlocks.push({
      key: 'sugar',
      lines: ['AÇÚCAR', 'ADICIONADO'],
      width: LUPA_SVG_PROPORTIONS.nutrientBoxWidths.sugar,
    });
  }
  if (warnings.highSaturatedFat) {
    activeBlocks.push({
      key: 'satFat',
      lines: ['GORDURA', 'SATURADA'],
      width: LUPA_SVG_PROPORTIONS.nutrientBoxWidths.satFat,
    });
  }
  if (warnings.highSodium) {
    activeBlocks.push({
      key: 'sodium',
      lines: ['SÓDIO'],
      width: LUPA_SVG_PROPORTIONS.nutrientBoxWidths.sodium,
    });
  }

  useEffect(() => {
    let active = true;
    if (activeBlocks.length === 0) {
      setCustomAssetFile(null);
      return;
    }

    fetchAvailableLupaAssets().then((files) => {
      if (!active) return;
      setCustomAssetFile(
        resolveMatchingLupaAsset(files, {
          highAddedSugar: warnings.highAddedSugar,
          highSaturatedFat: warnings.highSaturatedFat,
          highSodium: warnings.highSodium,
        })
      );
    });

    return () => {
      active = false;
    };
  }, [
    warnings.highAddedSugar,
    warnings.highSaturatedFat,
    warnings.highSodium,
    activeBlocks.length,
  ]);

  if (activeBlocks.length === 0) {
    return null;
  }

  const dims = getFrontalMagnifierDimensions(panelArea);

  if (customAssetFile) {
    const assetUrl = `/lupa/${encodeURIComponent(customAssetFile)}`;
    return (
      <div
        id={svgId}
        className="inline-flex flex-col items-center gap-1.5 select-none"
        data-lupa-asset-url={assetUrl}
        data-lupa-height-mm={dims.heightMm}
      >
        <img
          src={assetUrl}
          alt={`Alto em: ${activeBlocks.map((b) => b.lines.join(' ')).join(', ')}`}
          style={{
            height: `${dims.heightMm}mm`,
            width: 'auto',
            maxWidth: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
    );
  }

  const P = LUPA_SVG_PROPORTIONS;
  const H = P.viewBoxHeight;
  const pad = P.borderWidth;
  const innerH = H - pad * 2;
  const blocksTotalWidth =
    activeBlocks.reduce((acc, b) => acc + b.width, 0) +
    Math.max(0, activeBlocks.length - 1) * P.blockGap;
  const totalWidth = P.altoEmBoxWidth + blocksTotalWidth + pad;
  const widthMm = Number(((dims.heightMm * totalWidth) / H).toFixed(2));

  // Posição inicial dos blocos pretos de nutrientes
  let cursorX = P.altoEmBoxWidth;
  const ariaLabel = `Alto em ${activeBlocks.map((b) => b.lines.join(' ')).join(', ')}`;

  return (
    <svg
      id={svgId}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${totalWidth} ${H}`}
      width={`${widthMm}mm`}
      height={`${dims.heightMm}mm`}
      data-width-mm={widthMm}
      data-height-mm={dims.heightMm}
      role="img"
      aria-label={ariaLabel}
      className="max-w-full h-auto select-none block"
    >
      {/* Fundo branco externo com borda preta oficial */}
      <rect
        x={pad / 2}
        y={pad / 2}
        width={totalWidth - pad}
        height={H - pad}
        rx={P.outerCornerRadius}
        ry={P.outerCornerRadius}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={P.borderWidth}
      />

      {/* Bloco esquerdo: Símbolo da Lupa em SVG + texto "ALTO EM" */}
      <g>
        <circle
          cx={P.magnifierCx}
          cy={P.magnifierCy}
          r={P.magnifierRadius}
          fill="none"
          stroke="#000000"
          strokeWidth={P.magnifierStrokeWidth}
        />
        <line
          x1={P.magnifierCx + P.magnifierRadius * 0.7}
          y1={P.magnifierCy + P.magnifierRadius * 0.7}
          x2={P.magnifierHandleX2}
          y2={P.magnifierHandleY2}
          stroke="#000000"
          strokeWidth={P.magnifierStrokeWidth}
          strokeLinecap="round"
        />
        <text
          x={P.altoEmTextX}
          y={P.altoEmTextY}
          fill="#000000"
          fontFamily={P.fontFamily}
          fontWeight="700"
          fontSize={P.altoEmFontSize}
          letterSpacing={P.altoEmLetterSpacing}
          textAnchor="middle"
          dominantBaseline="central"
        >
          ALTO EM
        </text>
      </g>

      {/* Blocos pretos individuais para cada nutriente (texto branco centralizado) */}
      {activeBlocks.map((block, index) => {
        const blockX = cursorX;
        cursorX += block.width + P.blockGap;
        const isLast = index === activeBlocks.length - 1;
        const blockCenterX = blockX + block.width / 2;
        const centerY = H / 2;

        return (
          <g key={block.key}>
            <rect
              x={blockX}
              y={pad}
              width={block.width}
              height={innerH}
              rx={isLast ? P.innerCornerRadius : 2}
              ry={isLast ? P.innerCornerRadius : 2}
              fill="#000000"
            />
            {!isLast && (
              <rect
                x={blockX}
                y={pad}
                width={Math.min(12, block.width / 3)}
                height={innerH}
                fill="#000000"
              />
            )}
            {isLast && activeBlocks.length > 1 && (
              <rect
                x={blockX}
                y={pad}
                width={P.innerCornerRadius}
                height={innerH}
                fill="#000000"
              />
            )}

            {block.lines.length === 1 ? (
              <text
                x={blockCenterX}
                y={centerY}
                fill="#ffffff"
                fontFamily={P.fontFamily}
                fontWeight="700"
                fontSize={P.nutrientFontSize}
                letterSpacing={P.nutrientLetterSpacing}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {block.lines[0]}
              </text>
            ) : (
              <text
                x={blockCenterX}
                y={centerY}
                fill="#ffffff"
                fontFamily={P.fontFamily}
                fontWeight="700"
                fontSize={P.nutrientFontSize}
                letterSpacing={P.nutrientLetterSpacing}
                textAnchor="middle"
                dominantBaseline="central"
              >
                <tspan x={blockCenterX} dy={-P.nutrientTwoLineOffset}>
                  {block.lines[0]}
                </tspan>
                <tspan x={blockCenterX} dy={P.nutrientTwoLineOffset * 2}>
                  {block.lines[1]}
                </tspan>
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
