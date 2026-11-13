/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Fuse from 'fuse.js';

export interface TacoServerItem {
  tacoId: string;
  nome: string;
  categoria: string;
  energiaKcal: number | null;
  energiaKj: number | null;
  proteinas: number | null;
  lipideos: number | null;
  carboidratos: number | null;
  fibra: number | null;
  sodio: number | null; // mg
  gorduraSaturada: number | null;
  gorduraTrans: number | null;
}

interface IndexedTacoItem {
  item: TacoServerItem;
  nomeNorm: string;
  categoriaNorm: string;
}

export function normalizeTacoText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[,;()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell.replace(/\r$/, ''));
        if (row.some((c) => c.trim() !== '')) {
          rows.push(row);
        }
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some((c) => c.trim() !== '')) {
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Regras da Tabela TACO:
 * - "Tr" (traço) = 0
 * - "NA" = 0
 * - "*" ou vazio = null (não disponível)
 */
function parseTacoValue(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '*') {
    return null;
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'TR' || upper === 'NA') {
    return 0;
  }
  const normalizedNum = Number(trimmed.replace(',', '.'));
  return Number.isFinite(normalizedNum) ? normalizedNum : null;
}

function buildColumnIndexMap(headerRow: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headerRow.forEach((col, idx) => {
    map[col.trim()] = idx;
  });
  return map;
}

const MODULE_PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function resolveDataFilePath(fileName: string): string {
  const fromCwd = path.resolve(process.cwd(), 'data', fileName);
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(MODULE_PROJECT_ROOT, 'data', fileName);
}

interface TacoStore {
  items: TacoServerItem[];
  byId: Map<string, TacoServerItem>;
  fuse: Fuse<IndexedTacoItem>;
}

function loadTacoDatabase(): TacoStore {
  const tacoCsvPath = resolveDataFilePath('taco.csv');
  const acidosGraxosCsvPath = resolveDataFilePath('taco_acidos_graxos.csv');

  const tacoRaw = fs.readFileSync(tacoCsvPath, 'utf-8');
  const agRaw = fs.readFileSync(acidosGraxosCsvPath, 'utf-8');

  const tacoRows = parseCsv(tacoRaw);
  const agRows = parseCsv(agRaw);

  const agHeader = buildColumnIndexMap(agRows[0] || []);
  const agMap = new Map<string, { saturada: number | null; trans: number | null }>();

  for (let i = 1; i < agRows.length; i++) {
    const row = agRows[i];
    const numero = (row[agHeader['numero']] || '').trim();
    if (!numero) continue;

    agMap.set(numero, {
      saturada: parseTacoValue(row[agHeader['saturados_g']]),
      trans: parseTacoValue(row[agHeader['trans_total_g']]),
    });
  }

  const tacoHeader = buildColumnIndexMap(tacoRows[0] || []);
  const items: TacoServerItem[] = [];
  const byId = new Map<string, TacoServerItem>();
  const indexed: IndexedTacoItem[] = [];

  for (let i = 1; i < tacoRows.length; i++) {
    const row = tacoRows[i];
    const tacoId = (row[tacoHeader['numero']] || '').trim();
    const nome = (row[tacoHeader['descricao']] || '').trim();
    const categoria = (row[tacoHeader['categoria']] || '').trim();
    if (!tacoId || !nome) continue;

    const fattyAcids = agMap.get(tacoId);

    const item: TacoServerItem = {
      tacoId,
      nome,
      categoria,
      energiaKcal: parseTacoValue(row[tacoHeader['energia_kcal']]),
      energiaKj: parseTacoValue(row[tacoHeader['energia_kj']]),
      proteinas: parseTacoValue(row[tacoHeader['proteina_g']]),
      lipideos: parseTacoValue(row[tacoHeader['lipideos_g']]),
      carboidratos: parseTacoValue(row[tacoHeader['carboidrato_g']]),
      fibra: parseTacoValue(row[tacoHeader['fibra_alimentar_g']]),
      sodio: parseTacoValue(row[tacoHeader['sodio_mg']]),
      gorduraSaturada: fattyAcids ? fattyAcids.saturada : null,
      gorduraTrans: fattyAcids ? fattyAcids.trans : null,
    };

    items.push(item);
    byId.set(tacoId, item);
    indexed.push({
      item,
      nomeNorm: normalizeTacoText(nome),
      categoriaNorm: normalizeTacoText(categoria),
    });
  }

  const fuse = new Fuse(indexed, {
    keys: [
      { name: 'nomeNorm', weight: 0.85 },
      { name: 'categoriaNorm', weight: 0.15 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    includeScore: true,
    minMatchCharLength: 2,
  });

  console.log(`Tabela TACO carregada em memória: ${items.length} alimentos (${agMap.size} com ácidos graxos).`);

  return { items, byId, fuse };
}

let cachedTacoStore: TacoStore | null = null;

function getTacoStore(): TacoStore {
  if (!cachedTacoStore) {
    cachedTacoStore = loadTacoDatabase();
  }
  return cachedTacoStore;
}

export function getTacoCount(): number {
  return getTacoStore().items.length;
}

export function getTacoItemById(tacoId: string): TacoServerItem | undefined {
  return getTacoStore().byId.get(String(tacoId).trim());
}

export function searchTacoItems(query: string, limit = 10): TacoServerItem[] {
  const normalizedQuery = normalizeTacoText(query);
  if (!normalizedQuery) return [];

  const results = getTacoStore().fuse.search(normalizedQuery, { limit });
  return results.map((r) => r.item.item);
}
