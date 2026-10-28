import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DIFFICULTY_BANDS,
  MAX_RELIABLE_B,
  MIN_DISCRIMINATION,
  UNCLASSIFIED_DIFFICULTY,
  classifyDifficulty,
  difficultyBadgeLabel,
  formatDifficultyB,
  isDifficultyKey,
  isReliableDifficulty,
} from '../src/difficulty.js';

test('classifica as faixas de dificuldade nos limites exatos', () => {
  const cases = [
    [-2.6, 'muito-facil'],
    [0.49, 'muito-facil'],
    [0.5, 'facil'],
    [1.19, 'facil'],
    [1.2, 'medio'],
    [1.89, 'medio'],
    [1.9, 'dificil'],
    [2.49, 'dificil'],
    [2.5, 'muito-dificil'],
    [4.99, 'muito-dificil'],
  ];
  for (const [b, expected] of cases) {
    assert.equal(classifyDifficulty({ a: 1.2, b })?.key, expected, `b=${b}`);
  }
});

test('retorna null quando não há b ou quando o parâmetro não é confiável', () => {
  assert.equal(classifyDifficulty({ a: 1.2, b: null }), null);
  assert.equal(classifyDifficulty({ a: 1.2, b: undefined }), null);
  assert.equal(classifyDifficulty({ a: 1.2, b: Number.NaN }), null);
  assert.equal(classifyDifficulty({ a: 1.2, b: 'sem valor' }), null);
  // Discriminação baixa: b deixa de ser identificável.
  assert.equal(classifyDifficulty({ a: MIN_DISCRIMINATION - 0.01, b: 1.5 }), null);
  assert.equal(classifyDifficulty({ a: 0.02, b: 61.05 }), null);
  // Outlier de calibração.
  assert.equal(classifyDifficulty({ a: 1.2, b: MAX_RELIABLE_B + 0.01 }), null);
  // Sem discriminação informada.
  assert.equal(classifyDifficulty({ b: 1.5 }), null);
});

test('aceita b e a como texto numérico vindo do SQLite WASM', () => {
  assert.equal(classifyDifficulty({ a: '1.10', b: '2.10' })?.key, 'dificil');
  assert.equal(isReliableDifficulty({ a: '0.40', b: '1.00' }), false);
});

test('preserva o valor bruto de b no objeto classificado', () => {
  const difficulty = classifyDifficulty({ a: 1.4, b: 1.234 });
  assert.equal(difficulty.b, 1.234);
  assert.equal(difficulty.label, 'Médio');
  assert.equal(difficulty.color, '#9a5b00');
});

test('formata o rótulo com b em pt-BR', () => {
  assert.equal(formatDifficultyB(1.234), '1,23');
  assert.equal(formatDifficultyB(0), '0,00');
  assert.equal(formatDifficultyB(null), '');
  assert.equal(difficultyBadgeLabel(classifyDifficulty({ a: 1, b: 2.5 })), 'Muito difícil');
  assert.equal(difficultyBadgeLabel(null), 'Sem classificação (TRI)');
});

test('reconhece apenas chaves de filtro conhecidas', () => {
  assert.equal(isDifficultyKey('dificil'), true);
  assert.equal(isDifficultyKey(UNCLASSIFIED_DIFFICULTY.key), true);
  assert.equal(isDifficultyKey('todas'), false);
  assert.equal(isDifficultyKey(''), false);
});

test('faixas são contíguas e ordenadas', () => {
  for (let index = 1; index < DIFFICULTY_BANDS.length; index += 1) {
    assert.equal(DIFFICULTY_BANDS[index].min, DIFFICULTY_BANDS[index - 1].max);
  }
});
