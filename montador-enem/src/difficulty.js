/**
 * Classificação de dificuldade a partir dos parâmetros TRI publicados pelo Inep.
 *
 * O parâmetro `b` (dificuldade) é a medida oficial: quanto maior, mais difícil.
 * Ele só é interpretável quando o item tem discriminação razoável (`a`), por isso
 * itens com `a` muito baixo ou `b` fora da faixa calibrada ficam "sem classificação".
 */

export const MIN_DISCRIMINATION = 0.5;
export const MAX_RELIABLE_B = 5;

/**
 * Faixas derivadas dos percentis da base 2009–2025
 * (p25 ≈ 0,65 · p50 ≈ 1,23 · p75 ≈ 1,89 · p90 ≈ 2,47).
 * `min` é inclusivo e `max` é exclusivo; `null` significa sem limite.
 */
export const DIFFICULTY_BANDS = Object.freeze([
  Object.freeze({ key: 'muito-facil', label: 'Muito fácil', min: null, max: 0.5, color: '#1e7a35' }),
  Object.freeze({ key: 'facil', label: 'Fácil', min: 0.5, max: 1.2, color: '#4c7a1a' }),
  Object.freeze({ key: 'medio', label: 'Médio', min: 1.2, max: 1.9, color: '#9a5b00' }),
  Object.freeze({ key: 'dificil', label: 'Difícil', min: 1.9, max: 2.5, color: '#c2410c' }),
  Object.freeze({ key: 'muito-dificil', label: 'Muito difícil', min: 2.5, max: null, color: '#b3261e' }),
]);

export const UNCLASSIFIED_DIFFICULTY = Object.freeze({
  key: 'sem',
  label: 'Sem classificação',
  color: '#6b7280',
});

function asFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Um `b` só é confiável se existe, está dentro da faixa calibrada e o item
 * tem discriminação suficiente para identificá-lo.
 */
export function isReliableDifficulty({ a, b } = {}) {
  const discrimination = asFiniteNumber(a);
  const difficulty = asFiniteNumber(b);
  if (difficulty === null || difficulty > MAX_RELIABLE_B) return false;
  if (discrimination === null || discrimination < MIN_DISCRIMINATION) return false;
  return true;
}

/**
 * Retorna a faixa (`{ key, label, color, b }`) ou `null` quando não há `b` confiável.
 */
export function classifyDifficulty({ a, b } = {}) {
  if (!isReliableDifficulty({ a, b })) return null;
  const difficulty = asFiniteNumber(b);
  const band = DIFFICULTY_BANDS.find(
    (item) => (item.min === null || difficulty >= item.min) && (item.max === null || difficulty < item.max),
  ) ?? DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1];
  return { ...band, b: difficulty };
}

export function formatDifficultyB(value) {
  const difficulty = asFiniteNumber(value);
  return difficulty === null ? '' : difficulty.toFixed(2).replace('.', ',');
}

export function difficultyBadgeLabel(difficulty) {
  if (!difficulty) return `${UNCLASSIFIED_DIFFICULTY.label} (TRI)`;
  return difficulty.label;
}

export function isDifficultyKey(value) {
  return value === UNCLASSIFIED_DIFFICULTY.key || DIFFICULTY_BANDS.some((band) => band.key === value);
}
