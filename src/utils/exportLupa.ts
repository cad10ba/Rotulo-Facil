/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import jsPDF from 'jspdf';
import { Recipe } from '../types/nutrition';
import { getFrontalMagnifierDimensions } from './anvisaRules';

function buildSafeFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'rotulo_nutricional';
}

async function resolveLupaSvgMarkup(containerOrSvgId: string): Promise<{
  svgText: string | null;
  assetUrl: string | null;
  widthMm: number;
  heightMm: number;
}> {
  const el = document.getElementById(containerOrSvgId);
  if (!el) {
    return { svgText: null, assetUrl: null, widthMm: 50, heightMm: 12 };
  }

  const svgEl =
    el.tagName.toLowerCase() === 'svg'
      ? (el as unknown as SVGSVGElement)
      : (el.querySelector('svg') as SVGSVGElement | null);

  if (svgEl) {
    const serializer = new XMLSerializer();
    let svgText = serializer.serializeToString(svgEl);
    if (!svgText.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svgText = svgText.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const widthMm = Number(svgEl.getAttribute('data-width-mm')) || 50;
    const heightMm = Number(svgEl.getAttribute('data-height-mm')) || 12;
    return { svgText, assetUrl: null, widthMm, heightMm };
  }

  const assetHost = el.closest('[data-lupa-asset-url]') || el.querySelector('[data-lupa-asset-url]');
  const assetUrl = assetHost?.getAttribute('data-lupa-asset-url') || null;
  const heightMm = Number(assetHost?.getAttribute('data-lupa-height-mm')) || 12;

  if (assetUrl && assetUrl.toLowerCase().endsWith('.svg')) {
    const res = await fetch(assetUrl);
    if (res.ok) {
      const svgText = await res.text();
      return { svgText, assetUrl, widthMm: heightMm * 3, heightMm };
    }
  }

  return { svgText: null, assetUrl, widthMm: heightMm * 3, heightMm };
}

export async function exportLupaAsSvg(
  recipe: Recipe,
  svgOrContainerId = 'anvisa-frontal-magnifier-svg'
): Promise<boolean> {
  const { svgText, assetUrl } = await resolveLupaSvgMarkup(svgOrContainerId);
  const safeName = buildSafeFilename(recipe.name);

  if (svgText) {
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lupa_frontal_${safeName}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  if (assetUrl) {
    const link = document.createElement('a');
    link.href = assetUrl;
    link.download = `lupa_frontal_${safeName}`;
    link.click();
    return true;
  }

  return false;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

export async function exportLupaAsPdf(
  recipe: Recipe,
  svgOrContainerId = 'anvisa-frontal-magnifier-svg'
): Promise<boolean> {
  const { svgText, assetUrl, widthMm, heightMm } = await resolveLupaSvgMarkup(svgOrContainerId);
  if (!svgText && !assetUrl) return false;

  const dims = getFrontalMagnifierDimensions(recipe.panelArea);
  const safeName = buildSafeFilename(recipe.name);

  let imageSourceUrl = assetUrl || '';
  let revokeAfter = false;

  if (svgText) {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    imageSourceUrl = URL.createObjectURL(svgBlob);
    revokeAfter = true;
  }

  try {
    const img = await loadImage(imageSourceUrl);
    const naturalRatio = img.naturalWidth > 0 && img.naturalHeight > 0
      ? img.naturalWidth / img.naturalHeight
      : widthMm / heightMm;

    const targetHeightMm = dims.heightMm;
    const targetWidthMm = svgText ? widthMm : Number((targetHeightMm * naturalRatio).toFixed(2));

    // Renderiza em alta resolução (~600 DPI equivalente em escala proporcional) para impressão nítida
    const pxPerMm = 24;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(200, Math.round(targetWidthMm * pxPerMm));
    canvas.height = Math.max(80, Math.round(targetHeightMm * pxPerMm));

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const pngDataUrl = canvas.toDataURL('image/png', 1.0);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(15);
    pdf.text('Rotulagem Nutricional Frontal (Lupa ANVISA - Anexo XVII)', 15, 18);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Produto: ${recipe.name || 'Sem título'}`, 15, 25);
    pdf.text(
      `Painel principal: ${dims.panelAreaCm2} cm² (${dims.label}) | Dimensão física: ${targetWidthMm} mm × ${targetHeightMm} mm`,
      15,
      30
    );

    pdf.setDrawColor(200, 200, 200);
    pdf.line(15, 34, 195, 34);

    // Aplica a lupa em tamanho real em milímetros (escala 1:1 para painel frontal)
    pdf.addImage(pngDataUrl, 'PNG', 15, 44, targetWidthMm, targetHeightMm);

    pdf.setFontSize(8);
    pdf.setTextColor(110, 110, 110);
    pdf.text(
      'Escala real (mm) conforme a área do painel principal informada. Aplicar no painel frontal da embalagem.',
      15,
      44 + targetHeightMm + 8
    );

    pdf.save(`lupa_frontal_${safeName}.pdf`);
    return true;
  } finally {
    if (revokeAfter && imageSourceUrl) {
      URL.revokeObjectURL(imageSourceUrl);
    }
  }
}
