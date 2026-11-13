/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileText,
  Printer,
  Copy,
  Check,
  X,
  AlertTriangle,
  Scissors,
  Code2,
} from 'lucide-react';
import { toBlob } from 'html-to-image';
import { Recipe, CalculatedNutrition, LabelFormat } from '../types/nutrition';
import { NutritionLabel } from './NutritionLabel';
import { FrontalMagnifier } from './FrontalMagnifier';
import { exportLupaAsPdf, exportLupaAsSvg } from '../utils/exportLupa';
import {
  buildLabelVectorPlan,
  compute600DpiPixels,
  computeA4SheetLayout,
  exportLabelAsPng600Dpi,
  exportLabelAsSvg,
  exportLabelAsVectorPdfA4Sheet,
  exportLabelAsVectorPdfSingle,
} from '../utils/exportLabel';
import {
  ANVISA_TABLE_FORMAT_CONDITIONS_WARNING,
  getFrontalMagnifierDimensions,
} from '../utils/anvisaRules';

interface ExportModalProps {
  recipe: Recipe;
  nutrition: CalculatedNutrition;
  format: LabelFormat;
  onChangeFormat: (format: LabelFormat) => void;
  noVerticalSpace: boolean;
  onChangeNoVerticalSpace: (value: boolean) => void;
  onAcceptExportTerms: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export const EXPORT_RESPONSIBILITY_TERM =
  'Os valores são calculados a partir da TACO e dos dados informados. A responsabilidade pelo rótulo é do fabricante; recomenda-se validação por nutricionista.';

export const ExportModal: React.FC<ExportModalProps> = ({
  recipe,
  nutrition,
  format,
  onChangeFormat,
  noVerticalSpace,
  onChangeNoVerticalSpace,
  onAcceptExportTerms,
  isOpen,
  onClose,
}) => {
  const [showIngredients, setShowIngredients] = useState(true);
  const [showAllergens, setShowAllergens] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [termChecked, setTermChecked] = useState(false);

  const hasLupa =
    !nutrition.frontalExemption.isExempt &&
    (nutrition.frontalWarnings.highAddedSugar ||
      nutrition.frontalWarnings.highSaturatedFat ||
      nutrition.frontalWarnings.highSodium);
  const lupaDims = getFrontalMagnifierDimensions(recipe.panelArea);

  const isGlutenBlocked = nutrition.glutenResolution.requiresConfirmation;
  const isTermsPending = !recipe.exportTermsAccepted;
  const isExportBlocked = isGlutenBlocked || isTermsPending;

  useEffect(() => {
    setTermChecked(false);
  }, [recipe.id, isOpen]);

  const vectorPreviewMetrics = useMemo(() => {
    const plan = buildLabelVectorPlan(recipe, nutrition, {
      format,
      showIngredients,
      showAllergens,
    });
    const dpi600 = compute600DpiPixels(plan.widthMm, plan.heightMm);
    const a4Layout = computeA4SheetLayout(plan.widthMm, plan.heightMm);
    return {
      widthMm: plan.widthMm,
      heightMm: plan.heightMm,
      typography: plan.typography,
      dpi600,
      a4Count: a4Layout.placements.length,
    };
  }, [recipe, nutrition, format, showIngredients, showAllergens]);

  if (!isOpen) return null;

  const exportOptions = {
    format,
    showIngredients,
    showAllergens,
  };

  const getLabelElement = () => {
    return document.getElementById('anvisa-nutrition-label-container');
  };

  // Exportar PNG em 600 DPI calculado a partir das dimensões reais em mm
  const handleExportPng = async () => {
    if (isExportBlocked) return;
    try {
      setIsExporting(true);
      await exportLabelAsPng600Dpi(recipe, nutrition, exportOptions);
    } catch (err) {
      console.error('Erro ao gerar PNG 600 DPI:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Exportar SVG vetorial da tabela
  const handleExportSvg = () => {
    if (isExportBlocked) return;
    try {
      exportLabelAsSvg(recipe, nutrition, exportOptions);
    } catch (err) {
      console.error('Erro ao gerar SVG da tabela:', err);
    }
  };

  // Exportar PDF vetorial 1:1 no tamanho real da etiqueta em mm (sem cabeçalho extra)
  const handleExportPdfSingle = () => {
    if (isExportBlocked) return;
    try {
      setIsExporting(true);
      exportLabelAsVectorPdfSingle(recipe, nutrition, exportOptions);
    } catch (err) {
      console.error('Erro ao gerar PDF vetorial 1:1:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Exportar PDF vetorial em folha A4 com várias etiquetas e marcas de corte
  const handleExportPdfA4Sheet = () => {
    if (isExportBlocked) return;
    try {
      setIsExporting(true);
      exportLabelAsVectorPdfA4Sheet(recipe, nutrition, exportOptions);
    } catch (err) {
      console.error('Erro ao gerar folha A4 vetorial:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Copiar imagem para a área de transferência
  const handleCopyImage = async () => {
    if (isExportBlocked) return;
    const node = getLabelElement();
    if (!node) return;

    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
      });
      if (blob && navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ 'image/png': blob }),
        ]);
        setCopiedSuccess(true);
        setTimeout(() => setCopiedSuccess(false), 2500);
      }
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const handlePrint = () => {
    if (isExportBlocked) return;
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Cabeçalho do Modal */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Exportar Rótulo Nutricional ANVISA
            </h3>
            <p className="text-xs text-slate-500">
              {recipe.name || 'Receita sem título'} • Padrão vetorial para gráfica (mm / 600 DPI)
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com Configurações e Preview */}
        <div className="p-5 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Opções de Ajuste do Rótulo */}
          <div className="md:col-span-5 space-y-4">
            <div>
              <label className="text-xs font-bold uppercase text-slate-600 block mb-2">
                Formato Oficial ANVISA
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { id: 'vertical', label: 'Vertical Padrão', compactOnly: false },
                  { id: 'vertical_broken', label: 'Vertical Quebrado', compactOnly: false },
                  { id: 'horizontal', label: 'Horizontal', compactOnly: true },
                  { id: 'linear', label: 'Linear / Reduzido', compactOnly: true },
                ].map((item) => {
                  const isDisabled = item.compactOnly && !noVerticalSpace;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => onChangeFormat(item.id as LabelFormat)}
                      title={
                        isDisabled
                          ? 'Disponível somente quando não houver espaço para o formato vertical (IN 75/2020).'
                          : undefined
                      }
                      className={`py-2 px-2.5 rounded-xl text-left font-semibold border transition ${
                        format === item.id
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-600 ring-1 ring-emerald-600'
                          : isDisabled
                            ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <label className="mt-2.5 flex items-start gap-2 cursor-pointer text-[11px] text-slate-700">
                <input
                  type="checkbox"
                  checked={noVerticalSpace}
                  onChange={(e) => onChangeNoVerticalSpace(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Não há espaço disponível na embalagem para o modelo vertical</span>
              </label>

              <p className="mt-1.5 text-[10px] leading-snug text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2">
                {ANVISA_TABLE_FORMAT_CONDITIONS_WARNING}
              </p>
            </div>

            {/* Checkboxes de personalização da norma */}
            <div className="space-y-2 pt-2 border-t border-slate-200 text-xs">
              <label className="text-xs font-bold uppercase text-slate-600 block mb-1">
                Regras de Apresentação da Tabela
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={showIngredients}
                  onChange={(e) => setShowIngredients(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Incluir Lista de Ingredientes (ordem decrescente)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={showAllergens}
                  onChange={(e) => setShowAllergens(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Incluir Alergênicos & Glúten (RDC 727/2022)</span>
              </label>
            </div>

            {/* Especificação técnica física calculada pela faixa de área */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-0.5">
              <div className="font-bold text-slate-800">
                Dimensão real: {vectorPreviewMetrics.widthMm} mm × {vectorPreviewMetrics.heightMm} mm
              </div>
              <div>
                PNG 600 DPI: {vectorPreviewMetrics.dpi600.widthPx} × {vectorPreviewMetrics.dpi600.heightPx} px
              </div>
              <div>
                Fonte (painel {vectorPreviewMetrics.typography.label}): {vectorPreviewMetrics.typography.bodyFontPt} pt (mín. {vectorPreviewMetrics.typography.minFontPt} / máx. {vectorPreviewMetrics.typography.maxFontPt} pt) • Linha: {vectorPreviewMetrics.typography.thinLineMm}–{vectorPreviewMetrics.typography.thickLineMm} mm
              </div>
            </div>

            {/* Aviso de bloqueio por confirmação de glúten pendente */}
            {isGlutenBlocked && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Exportação bloqueada — confirmação de glúten pendente</div>
                  <p className="mt-0.5 leading-snug">
                    Volte à aba <strong>1. Receita</strong> e confirme explicitamente se o produto{' '}
                    <strong>CONTÉM GLÚTEN</strong> ou <strong>NÃO CONTÉM GLÚTEN</strong> (verificando risco de contaminação cruzada).
                  </p>
                </div>
              </div>
            )}

            {/* Termo de responsabilidade antes da primeira exportação desta receita */}
            {isTermsPending && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
                <div className="font-bold text-amber-900">
                  Termo de Responsabilidade (obrigatório na primeira exportação)
                </div>
                <p className="leading-snug">{EXPORT_RESPONSIBILITY_TERM}</p>
                <label className="flex items-start gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={termChecked}
                    onChange={(e) => setTermChecked(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span>Li e estou ciente do termo acima para esta receita.</span>
                </label>
                <button
                  type="button"
                  disabled={!termChecked}
                  onClick={() => {
                    onAcceptExportTerms();
                    setTermChecked(false);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs transition cursor-pointer"
                >
                  Confirmar Aceite e Liberar Exportação
                </button>
              </div>
            )}

            {/* Ações de Download e Exportação */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <button
                type="button"
                disabled={isExporting || isExportBlocked}
                onClick={handleExportPdfSingle}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <FileText className="w-4 h-4" />
                <span>PDF Vetorial 1:1 ({vectorPreviewMetrics.widthMm}×{vectorPreviewMetrics.heightMm} mm)</span>
              </button>

              <button
                type="button"
                disabled={isExporting || isExportBlocked}
                onClick={handleExportPdfA4Sheet}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Scissors className="w-4 h-4" />
                <span>
                  PDF Folha A4 com Marcas de Corte ({vectorPreviewMetrics.a4Count} por folha)
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isExporting || isExportBlocked}
                  onClick={handleExportPng}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>PNG 600 DPI</span>
                </button>

                <button
                  type="button"
                  disabled={isExporting || isExportBlocked}
                  onClick={handleExportSvg}
                  className="py-2.5 px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>Tabela SVG</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isExporting || isExportBlocked}
                  onClick={handleCopyImage}
                  className="py-2 px-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copiedSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isExporting || isExportBlocked}
                  onClick={handlePrint}
                  className="py-2 px-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Imprimir</span>
                </button>
              </div>
            </div>

            {/* Exportação própria da Lupa Frontal (Painel Principal) */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <label className="text-xs font-bold uppercase text-slate-600 block">
                Painel Frontal — Lupa ANVISA (Anexo XVII)
              </label>
              {nutrition.frontalExemption.isExempt ? (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] leading-snug">
                  <strong>Isento de Lupa Frontal:</strong> {nutrition.frontalExemption.reason}
                </div>
              ) : hasLupa ? (
                <>
                  <p className="text-[11px] text-slate-500">
                    Escala: altura {lupaDims.heightMm} mm (painel {lupaDims.panelAreaCm2} cm²).
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isExporting || isExportBlocked}
                      onClick={() => exportLupaAsSvg(recipe, 'export-modal-frontal-magnifier-svg')}
                      className="py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>Lupa SVG</span>
                    </button>
                    <button
                      type="button"
                      disabled={isExporting || isExportBlocked}
                      onClick={() => exportLupaAsPdf(recipe, 'export-modal-frontal-magnifier-svg')}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Lupa PDF</span>
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Este produto não atingiu os critérios de Lupa Frontal.
                </p>
              )}
            </div>
          </div>

          {/* Área de Visualização Fiel */}
          <div className="md:col-span-7 bg-slate-100/80 p-4 rounded-2xl flex flex-col items-center justify-center gap-4 border border-slate-200/80 overflow-x-auto min-h-[360px]">
            {hasLupa && (
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col items-center gap-1.5 max-w-full">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Painel Frontal (separado da tabela)
                </span>
                <FrontalMagnifier
                  warnings={nutrition.frontalWarnings}
                  panelArea={recipe.panelArea}
                  svgId="export-modal-frontal-magnifier-svg"
                />
              </div>
            )}

            <div className="shadow-lg transform scale-95 sm:scale-100 transition origin-top">
              <NutritionLabel
                recipe={recipe}
                nutrition={nutrition}
                format={format}
                showIngredients={showIngredients}
                showAllergens={showAllergens}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
