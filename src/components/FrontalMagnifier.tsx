/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { getFrontalMagnifierDimensions } from '../utils/anvisaRules';
import { LUPA_SVG_PROPORTIONS, computeLupaLayout } from '../utils/lupaSvg';

export { LUPA_SVG_PROPORTIONS };

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

  const layout = computeLupaLayout(warnings, panelArea);
  const hasAnyWarning = Boolean(layout);

  useEffect(() => {
    let active = true;
    if (!hasAnyWarning) {
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
    hasAnyWarning,
  ]);

  if (!layout) {
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
          alt={layout.ariaLabel}
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

  return (
    <svg
      id={svgId}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.totalWidth} ${layout.height}`}
      width={`${layout.widthMm}mm`}
      height={`${layout.heightMm}mm`}
      data-width-mm={layout.widthMm}
      data-height-mm={layout.heightMm}
      role="img"
      aria-label={layout.ariaLabel}
      className="max-w-full h-auto select-none block"
    >
      {/* Fundo branco externo com borda preta oficial */}
      <rect
        x={layout.pad / 2}
        y={layout.pad / 2}
        width={layout.totalWidth - layout.pad}
        height={layout.height - layout.pad}
        rx={P.outerCornerRadius}
        ry={P.outerCornerRadius}
        fill="#ffffff"
        stroke="#000000"
        strokeWidth={P.borderWidth}
      />

      {/* Zona 1 e Zona 2 separadas: Símbolo da Lupa | folga fixa | texto "ALTO EM" */}
      <g data-lupa-zone="header">
        <circle
          cx={layout.magnifier.cx}
          cy={layout.magnifier.cy}
          r={layout.magnifier.r}
          fill="none"
          stroke="#000000"
          strokeWidth={layout.magnifier.strokeWidth}
        />
        <line
          x1={layout.magnifier.handleX1}
          y1={layout.magnifier.handleY1}
          x2={layout.magnifier.handleX2}
          y2={layout.magnifier.handleY2}
          stroke="#000000"
          strokeWidth={layout.magnifier.strokeWidth}
          strokeLinecap="round"
        />
        <text
          x={layout.altoEm.x}
          y={layout.altoEm.y}
          fill="#000000"
          fontFamily={P.fontFamily}
          fontWeight="700"
          fontSize={layout.altoEm.fontSize}
          letterSpacing={P.altoEmLetterSpacing}
          textAnchor="middle"
          dominantBaseline="central"
          textLength={layout.altoEm.textLength}
          lengthAdjust="spacingAndGlyphs"
        >
          ALTO EM
        </text>
      </g>

      {/* Zona 3: Blocos pretos individuais para cada nutriente */}
      {layout.blocks.map((block) => (
        <g key={block.key} data-lupa-block={block.key}>
          <rect
            x={block.x}
            y={block.y}
            width={block.width}
            height={block.height}
            rx={block.isLast ? P.innerCornerRadius : 2}
            ry={block.isLast ? P.innerCornerRadius : 2}
            fill="#000000"
          />
          {!block.isLast && (
            <rect
              x={block.x}
              y={block.y}
              width={Math.min(12, block.width / 3)}
              height={block.height}
              fill="#000000"
            />
          )}
          {block.isLast && layout.blocks.length > 1 && (
            <rect
              x={block.x}
              y={block.y}
              width={P.innerCornerRadius}
              height={block.height}
              fill="#000000"
            />
          )}

          {block.lines.map((line) => (
            <text
              key={line.text}
              x={line.x}
              y={line.y}
              fill="#ffffff"
              fontFamily={P.fontFamily}
              fontWeight="700"
              fontSize={line.fontSize}
              letterSpacing={P.nutrientLetterSpacing}
              textAnchor="middle"
              dominantBaseline="central"
              textLength={line.textLength}
              lengthAdjust="spacingAndGlyphs"
            >
              {line.text}
            </text>
          ))}
        </g>
      ))}
    </svg>
  );
};
