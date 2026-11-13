/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lista fechada de alergênicos alimentares conforme RDC nº 727/2022 (ANVISA),
 * regras de glúten (Lei nº 10.674/2003) e lactose (RDC nº 136/2017).
 */

import type {
  AllergenId,
  AllergenPresence,
  GlutenStatus,
  Ingredient,
  IngredientAllergenDeclaration,
  Recipe,
} from '../types/nutrition';

/**
 * VERIFICAR com a RDC 727/2022: conferir a grafia oficial de cada item da lista fechada
 * e as regras de agrupamento/declaração de cereais contendo glúten e castanhas.
 */
export interface ClosedAllergenDef {
  id: AllergenId;
  label: string;
  declarationName: string;
  triggersGluten: boolean;
}

export const RDC_727_ALLERGENS: readonly ClosedAllergenDef[] = [
  {
    id: 'trigo',
    label: 'Trigo',
    declarationName: 'TRIGO',
    triggersGluten: true,
  },
  {
    id: 'centeio',
    label: 'Centeio',
    declarationName: 'CENTEIO',
    triggersGluten: true,
  },
  {
    id: 'cevada',
    label: 'Cevada',
    declarationName: 'CEVADA',
    triggersGluten: true,
  },
  {
    id: 'aveia',
    label: 'Aveia',
    declarationName: 'AVEIA',
    triggersGluten: true,
  },
  {
    id: 'estirpes_hibridizadas',
    label: 'Estirpes hibridizadas (trigo, centeio, cevada, aveia)',
    declarationName: 'TRIGO, CENTEIO, CEVADA, AVEIA E SUAS ESTIRPES HIBRIDIZADAS',
    triggersGluten: true,
  },
  {
    id: 'crustaceos',
    label: 'Crustáceos',
    declarationName: 'CRUSTÁCEOS',
    triggersGluten: false,
  },
  {
    id: 'ovos',
    label: 'Ovos',
    declarationName: 'OVOS',
    triggersGluten: false,
  },
  {
    id: 'peixes',
    label: 'Peixes',
    declarationName: 'PEIXES',
    triggersGluten: false,
  },
  {
    id: 'amendoim',
    label: 'Amendoim',
    declarationName: 'AMENDOIM',
    triggersGluten: false,
  },
  {
    id: 'soja',
    label: 'Soja',
    declarationName: 'SOJA',
    triggersGluten: false,
  },
  {
    id: 'leite',
    label: 'Leites de todas as espécies de animais mamíferos',
    declarationName: 'LEITE',
    triggersGluten: false,
  },
  {
    id: 'amendoa',
    label: 'Amêndoa',
    declarationName: 'AMÊNDOA',
    triggersGluten: false,
  },
  {
    id: 'avela',
    label: 'Avelã',
    declarationName: 'AVELÃ',
    triggersGluten: false,
  },
  {
    id: 'castanha_de_caju',
    label: 'Castanha-de-caju',
    declarationName: 'CASTANHA-DE-CAJU',
    triggersGluten: false,
  },
  {
    id: 'castanha_do_brasil',
    label: 'Castanha-do-brasil ou castanha-do-pará',
    declarationName: 'CASTANHA-DO-BRASIL',
    triggersGluten: false,
  },
  {
    id: 'macadamia',
    label: 'Macadâmia',
    declarationName: 'MACADÂMIA',
    triggersGluten: false,
  },
  {
    id: 'nozes',
    label: 'Nozes',
    declarationName: 'NOZES',
    triggersGluten: false,
  },
  {
    id: 'peca',
    label: 'Pecã',
    declarationName: 'PECÃ',
    triggersGluten: false,
  },
  {
    id: 'pistache',
    label: 'Pistache',
    declarationName: 'PISTACHE',
    triggersGluten: false,
  },
  {
    id: 'pinoli',
    label: 'Pinoli',
    declarationName: 'PINOLI',
    triggersGluten: false,
  },
  {
    id: 'castanhas',
    label: 'Castanhas',
    declarationName: 'CASTANHAS',
    triggersGluten: false,
  },
  {
    id: 'latex_natural',
    label: 'Látex natural',
    declarationName: 'LÁTEX NATURAL',
    triggersGluten: false,
  },
] as const;

// VERIFICAR o limite da RDC 136/2017 (alimentos que contenham lactose em quantidade maior que 100 mg por 100 g ou 100 ml).
export const ANVISA_LACTOSE_LIMIT_MG_PER_100 = 100;

export const GLUTEN_TRIGGER_ALLERGEN_IDS: readonly AllergenId[] = [
  'trigo',
  'centeio',
  'cevada',
  'aveia',
  'estirpes_hibridizadas',
];

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeLegacyAllergenToId(raw: string): AllergenId | null {
  const n = normalizeText(raw);
  if (!n) return null;

  const direct = RDC_727_ALLERGENS.find(
    (a) =>
      a.id === n ||
      normalizeText(a.label) === n ||
      normalizeText(a.declarationName) === n
  );
  if (direct) return direct.id;

  if (n.includes('trigo')) return 'trigo';
  if (n.includes('centeio')) return 'centeio';
  if (n.includes('cevada')) return 'cevada';
  if (n.includes('aveia')) return 'aveia';
  if (n.includes('hibrid')) return 'estirpes_hibridizadas';
  if (n.includes('crustaceo') || n.includes('camarao') || n.includes('lagosta') || n.includes('caranguejo')) return 'crustaceos';
  if (n.includes('ovo')) return 'ovos';
  if (n.includes('peixe')) return 'peixes';
  if (n.includes('amendoim')) return 'amendoim';
  if (n.includes('soja')) return 'soja';
  if (n.includes('leite')) return 'leite';
  if (n.includes('amendoa')) return 'amendoa';
  if (n.includes('avela')) return 'avela';
  if (n.includes('caju')) return 'castanha_de_caju';
  if (n.includes('brasil') || n.includes('para')) return 'castanha_do_brasil';
  if (n.includes('macadamia')) return 'macadamia';
  if (n.includes('nozes') || n === 'noz') return 'nozes';
  if (n.includes('peca')) return 'peca';
  if (n.includes('pistache')) return 'pistache';
  if (n.includes('pinoli')) return 'pinoli';
  if (n.includes('castanha')) return 'castanhas';
  if (n.includes('latex')) return 'latex_natural';

  return null;
}

export function getAllergenDef(id: AllergenId): ClosedAllergenDef | undefined {
  return RDC_727_ALLERGENS.find((a) => a.id === id);
}

/**
 * Pré-marca alergênicos da lista fechada (RDC 727/2022) por regra a partir do nome do ingrediente,
 * sugerindo "contains" ou "derivatives" para confirmação/edição pelo usuário.
 */
export function suggestAllergensFromIngredientName(
  name: string
): IngredientAllergenDeclaration[] {
  const n = normalizeText(name);
  const map = new Map<AllergenId, AllergenPresence>();

  const setIfAbsent = (id: AllergenId, presence: AllergenPresence) => {
    const existing = map.get(id);
    if (!existing || presence === 'contains') {
      map.set(id, presence);
    }
  };

  // Trigo, centeio, cevada, aveia e estirpes hibridizadas
  if (/\b(triticale|espelta|kamut|estirpe)/i.test(n)) {
    setIfAbsent('estirpes_hibridizadas', 'contains');
  }
  if (/\b(trigo|farinha de trigo|farinha, de trigo|semola|semolina|macarrao|espaguete|pao|biscoito|bolo|pastel)\b/i.test(n)) {
    const isDerivative = /\b(amido de trigo|glucose de trigo|dextrose de trigo|fibra de trigo)\b/i.test(n);
    setIfAbsent('trigo', isDerivative ? 'derivatives' : 'contains');
  }
  if (/\bcenteio\b/i.test(n)) {
    setIfAbsent('centeio', 'contains');
  }
  if (/\b(cevada|malte)\b/i.test(n)) {
    const isDerivative = /\b(extrato de malte|malte)\b/i.test(n) && !/\bcevada\b/i.test(n);
    setIfAbsent('cevada', isDerivative ? 'derivatives' : 'contains');
  }
  if (/\baveia\b/i.test(n)) {
    setIfAbsent('aveia', 'contains');
  }

  // Leite e derivados lácteos (ex.: queijo -> derivados de leite)
  if (/\b(queijo|requeijao|manteiga|creme de leite|nata|iogurte|coalhada|ricota|mussarela|parmesao|soro de leite|whey|caseina|caseinato|lactoalbumina|margarina com leite|doce de leite)\b/i.test(n)) {
    setIfAbsent('leite', 'derivatives');
  } else if (/\b(leite|leite em po|leite condensado|leite evaporado|bebida lactea)\b/i.test(n)) {
    setIfAbsent('leite', 'contains');
  }

  // Ovos
  if (/\b(maionese|albumina|lecitina de ovo)\b/i.test(n)) {
    setIfAbsent('ovos', 'derivatives');
  } else if (/\b(ovo|ovos|clara|gema|omelete)\b/i.test(n)) {
    setIfAbsent('ovos', 'contains');
  }

  // Soja
  if (/\b(oleo de soja|oleo, de soja|lecitina de soja|shoyu|molho de soja|proteina texturizada de soja|extrato de soja)\b/i.test(n)) {
    setIfAbsent('soja', 'derivatives');
  } else if (/\b(soja|tofu|edamame|missô|misso)\b/i.test(n)) {
    setIfAbsent('soja', 'contains');
  }

  // Amendoim
  if (/\b(oleo de amendoim)\b/i.test(n)) {
    setIfAbsent('amendoim', 'derivatives');
  } else if (/\b(amendoim|pacoca|pasta de amendoim)\b/i.test(n)) {
    setIfAbsent('amendoim', 'contains');
  }

  // Peixes e Crustáceos
  if (/\b(peixe|salmao|atum|sardinha|bacalhau|merluza|tilapia|pescada|anchova|truta)\b/i.test(n)) {
    setIfAbsent('peixes', 'contains');
  }
  if (/\b(crustaceo|crustaceos|camarao|lagosta|caranguejo|siri|lagostim)\b/i.test(n)) {
    setIfAbsent('crustaceos', 'contains');
  }

  // Oleaginosas / Castanhas
  if (/\b(amendoa|amendoas)\b/i.test(n)) setIfAbsent('amendoa', 'contains');
  if (/\b(avela|avelas)\b/i.test(n)) setIfAbsent('avela', 'contains');
  if (/castanha[- ]de[- ]caju/i.test(n)) setIfAbsent('castanha_de_caju', 'contains');
  if (/castanha[- ]do[- ](brasil|para)/i.test(n)) setIfAbsent('castanha_do_brasil', 'contains');
  if (/\bmacadamia\b/i.test(n)) setIfAbsent('macadamia', 'contains');
  if (/\bnozes\b/i.test(n)) setIfAbsent('nozes', 'contains');
  if (/\bpeca\b/i.test(n)) setIfAbsent('peca', 'contains');
  if (/\bpistache\b/i.test(n)) setIfAbsent('pistache', 'contains');
  if (/\bpinoli\b/i.test(n)) setIfAbsent('pinoli', 'contains');
  if (
    /\bcastanhas?\b/i.test(n) &&
    !/castanha[- ]de[- ]caju/i.test(n) &&
    !/castanha[- ]do[- ](brasil|para)/i.test(n)
  ) {
    setIfAbsent('castanhas', 'contains');
  }

  // Látex natural
  if (/\blatex\b/i.test(n)) {
    setIfAbsent('latex_natural', 'contains');
  }

  return Array.from(map.entries()).map(([allergenId, presence]) => ({
    allergenId,
    presence,
  }));
}

/**
 * Retorna as declarações estruturadas de um ingrediente (lendo allergenDeclarations ou migrando legado).
 */
export function getEffectiveIngredientAllergens(
  ingredient: Ingredient
): IngredientAllergenDeclaration[] {
  if (Array.isArray(ingredient.allergenDeclarations)) {
    return ingredient.allergenDeclarations;
  }

  const fromRules = suggestAllergensFromIngredientName(ingredient.name);
  const map = new Map<AllergenId, AllergenPresence>();

  fromRules.forEach((item) => map.set(item.allergenId, item.presence));

  if (Array.isArray(ingredient.allergens)) {
    ingredient.allergens.forEach((raw) => {
      const id = normalizeLegacyAllergenToId(raw);
      if (id && !map.has(id)) {
        map.set(id, 'contains');
      }
    });
  }

  return Array.from(map.entries()).map(([allergenId, presence]) => ({
    allergenId,
    presence,
  }));
}

function joinPortugueseList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} E ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} E ${items[items.length - 1]}`;
}

/**
 * Gera as frases oficiais da RDC 727/2022 em caixa alta:
 * - "ALÉRGICOS: CONTÉM X, Y E DERIVADOS DE Z."
 * - "ALÉRGICOS: PODE CONTER W."
 * Quando não houver nenhum alergênico, retorna null (nada deve ser exibido).
 */
export function buildAllergenStatements(recipe: Recipe): {
  containsSentence: string | null;
  mayContainSentence: string | null;
  hasAnyMilkAllergen: boolean;
  hasGlutenCereal: boolean;
} {
  const presenceMap = new Map<AllergenId, AllergenPresence>();

  recipe.ingredients.forEach((ing) => {
    const decls = getEffectiveIngredientAllergens(ing);
    decls.forEach(({ allergenId, presence }) => {
      const prev = presenceMap.get(allergenId);
      // "contains" prevalece sobre "derivatives" se ambos ocorrerem na receita
      if (!prev || presence === 'contains') {
        presenceMap.set(allergenId, presence);
      }
    });
  });

  // Compatibilidade com declaredAllergens legado quando nenhuma declaração por ingrediente foi definida ainda
  if (presenceMap.size === 0 && Array.isArray(recipe.declaredAllergens)) {
    recipe.declaredAllergens.forEach((raw) => {
      const id = normalizeLegacyAllergenToId(raw);
      if (id && !presenceMap.has(id)) {
        presenceMap.set(id, 'contains');
      }
    });
  }

  const containsNames: string[] = [];
  const derivativesNames: string[] = [];

  RDC_727_ALLERGENS.forEach((def) => {
    const p = presenceMap.get(def.id);
    if (p === 'contains') containsNames.push(def.declarationName);
    else if (p === 'derivatives') derivativesNames.push(def.declarationName);
  });

  let containsSentence: string | null = null;
  if (containsNames.length > 0 && derivativesNames.length > 0) {
    containsSentence = `ALÉRGICOS: CONTÉM ${containsNames.join(', ')} E DERIVADOS DE ${joinPortugueseList(derivativesNames)}.`;
  } else if (containsNames.length > 0) {
    containsSentence = `ALÉRGICOS: CONTÉM ${joinPortugueseList(containsNames)}.`;
  } else if (derivativesNames.length > 0) {
    containsSentence = `ALÉRGICOS: CONTÉM DERIVADOS DE ${joinPortugueseList(derivativesNames)}.`;
  }

  // "PODE CONTER" (contaminação cruzada) exclui alergênicos já declarados como "CONTÉM"
  const mayContainNames: string[] = [];
  const mayContainSet = new Set(recipe.mayContainAllergens || []);
  RDC_727_ALLERGENS.forEach((def) => {
    if (mayContainSet.has(def.id) && presenceMap.get(def.id) !== 'contains') {
      mayContainNames.push(def.declarationName);
    }
  });

  const mayContainSentence =
    mayContainNames.length > 0
      ? `ALÉRGICOS: PODE CONTER ${joinPortugueseList(mayContainNames)}.`
      : null;

  const hasGlutenCereal =
    recipe.ingredients.some((ing) => {
      if (ing.containsGluten) return true;
      return getEffectiveIngredientAllergens(ing).some((d) => {
        const def = getAllergenDef(d.allergenId);
        return Boolean(def?.triggersGluten);
      });
    }) ||
    (recipe.mayContainAllergens || []).some((id) =>
      GLUTEN_TRIGGER_ALLERGEN_IDS.includes(id)
    );

  const hasAnyMilkAllergen =
    presenceMap.has('leite') || mayContainSet.has('leite');

  return {
    containsSentence,
    mayContainSentence,
    hasAnyMilkAllergen,
    hasGlutenCereal,
  };
}

/**
 * Resolve o status e a frase obrigatória de glúten (Lei nº 10.674/2003).
 * Nunca declara "NÃO CONTÉM GLÚTEN" automaticamente.
 */
export function resolveGlutenStatus(recipe: Recipe): {
  effectiveStatus: GlutenStatus;
  hasGlutenCereal: boolean;
  statement: 'CONTÉM GLÚTEN' | 'NÃO CONTÉM GLÚTEN' | null;
  requiresConfirmation: boolean;
} {
  const { hasGlutenCereal } = buildAllergenStatements(recipe);

  if (hasGlutenCereal) {
    return {
      effectiveStatus: 'contains',
      hasGlutenCereal: true,
      statement: 'CONTÉM GLÚTEN',
      requiresConfirmation: false,
    };
  }

  if (recipe.glutenStatus === 'contains' || recipe.containsGluten) {
    return {
      effectiveStatus: 'contains',
      hasGlutenCereal: false,
      statement: 'CONTÉM GLÚTEN',
      requiresConfirmation: false,
    };
  }

  if (recipe.glutenStatus === 'does_not_contain') {
    return {
      effectiveStatus: 'does_not_contain',
      hasGlutenCereal: false,
      statement: 'NÃO CONTÉM GLÚTEN',
      requiresConfirmation: false,
    };
  }

  return {
    effectiveStatus: 'unconfirmed',
    hasGlutenCereal: false,
    statement: null,
    requiresConfirmation: true,
  };
}

/**
 * Monta o texto da lista de ingredientes em ordem decrescente de quantidade (RDC 727/2022),
 * utilizando `labelName` editável e formato "função nome" para aditivos alimentares.
 */
export function buildIngredientsListText(ingredients: Ingredient[]): string {
  if (!ingredients || ingredients.length === 0) return '';

  const sorted = [...ingredients].sort((a, b) => b.grams - a.grams);
  const parts = sorted
    .map((ing) => {
      const baseName = (ing.labelName && ing.labelName.trim()) || ing.name.trim();
      if (!baseName) return '';
      if (ing.isAdditive && ing.additiveFunction && ing.additiveFunction.trim()) {
        return `${ing.additiveFunction.trim()} ${baseName}`;
      }
      return baseName;
    })
    .filter(Boolean);

  return parts.length > 0 ? `${parts.join(', ')}.` : '';
}
