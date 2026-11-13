/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OverflowElementInfo {
  selector: string;
  widthPx: number;
  scrollWidthPx: number;
  overflowPx: number;
}

function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const idPart = el.id ? `#${el.id}` : '';
  const classList =
    typeof (el as HTMLElement).className === 'string'
      ? (el as HTMLElement).className
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .map((c) => `.${c}`)
          .join('')
      : '';
  return `${tag}${idPart}${classList}`;
}

export function checkHorizontalOverflow(context = 'viewport'): OverflowElementInfo[] {
  if (!import.meta.env.DEV || typeof window === 'undefined' || typeof document === 'undefined') {
    return [];
  }

  const docEl = document.documentElement;
  const clientWidth = docEl.clientWidth;
  const scrollWidth = docEl.scrollWidth;

  if (scrollWidth <= clientWidth) {
    return [];
  }

  const candidates: OverflowElementInfo[] = [];
  const elements = document.querySelectorAll('body *');

  for (let i = 0; i < elements.length; i += 1) {
    const el = elements[i];
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'META') {
      continue;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      continue;
    }

    const overflowRight = Math.max(0, rect.right - clientWidth);
    const overflowLeft = Math.max(0, -rect.left);
    const widthOverflow = Math.max(0, rect.width - clientWidth);
    const overflowPx = Math.max(overflowRight, overflowLeft, widthOverflow);

    if (overflowPx > 0.5) {
      candidates.push({
        selector: describeElement(el),
        widthPx: Math.round(rect.width),
        scrollWidthPx: el instanceof HTMLElement ? el.scrollWidth : Math.round(rect.width),
        overflowPx: Math.round(overflowPx),
      });
    }
  }

  const top5 = candidates
    .sort((a, b) => b.widthPx - a.widthPx || b.overflowPx - a.overflowPx)
    .slice(0, 5);

  console.warn(
    `[devOverflowCheck:${context}] Rolagem horizontal detectada: scrollWidth (${scrollWidth}px) > clientWidth (${clientWidth}px). Top 5 elementos mais largos:`,
    top5
  );

  return top5;
}

export function installDevOverflowListener(getContext?: () => string): () => void {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return () => {};
  }

  let rafId: number | null = null;
  const onResize = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    rafId = requestAnimationFrame(() => {
      rafId = null;
      checkHorizontalOverflow(getContext ? getContext() : 'resize');
    });
  };

  window.addEventListener('resize', onResize);
  onResize();

  return () => {
    window.removeEventListener('resize', onResize);
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
  };
}
