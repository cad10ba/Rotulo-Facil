/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useLayoutEffect, useRef, useState } from 'react';

interface FitToWidthProps {
  children: React.ReactNode;
  maxScale?: number;
  className?: string;
}

interface ScaleMetrics {
  scale: number;
  scaledWidth: number | null;
  scaledHeight: number | null;
}

export const FitToWidth: React.FC<FitToWidthProps> = ({
  children,
  maxScale = 1,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [metrics, setMetrics] = useState<ScaleMetrics>({
    scale: 1,
    scaledWidth: null,
    scaledHeight: null,
  });

  useLayoutEffect(() => {
    const containerEl = containerRef.current;
    const contentEl = contentRef.current;
    if (!containerEl || !contentEl) return;

    const measure = () => {
      const availableWidth = containerEl.clientWidth;
      const naturalWidth = contentEl.offsetWidth;
      const naturalHeight = contentEl.offsetHeight;

      if (availableWidth <= 0 || naturalWidth <= 0 || naturalHeight <= 0) {
        return;
      }

      const nextScale = Math.min(maxScale, availableWidth / naturalWidth);
      const nextScaledWidth = Math.min(availableWidth, Math.floor(naturalWidth * nextScale));
      const nextScaledHeight = Math.ceil(naturalHeight * nextScale);

      setMetrics((prev) => {
        if (
          Math.abs(prev.scale - nextScale) < 0.002 &&
          prev.scaledWidth === nextScaledWidth &&
          prev.scaledHeight === nextScaledHeight
        ) {
          return prev;
        }
        return {
          scale: nextScale,
          scaledWidth: nextScaledWidth,
          scaledHeight: nextScaledHeight,
        };
      });
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(containerEl);
    observer.observe(contentEl);

    return () => {
      observer.disconnect();
    };
  }, [maxScale, children]);

  return (
    <div ref={containerRef} className={`w-full min-w-0 overflow-hidden ${className}`}>
      <div
        className="relative mx-auto"
        style={{
          width: metrics.scaledWidth !== null ? `${metrics.scaledWidth}px` : undefined,
          height: metrics.scaledHeight !== null ? `${metrics.scaledHeight}px` : undefined,
        }}
      >
        <div
          ref={contentRef}
          className="inline-block w-max"
          style={{
            transform: metrics.scale < 1 ? `scale(${metrics.scale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
