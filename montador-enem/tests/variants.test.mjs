import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnswerKey, buildVariant, buildVariants } from '../src/variants.js';

function question() {
  return {
    id: 42,
    title: 'Questão de teste',
    correctAlternative: 'C',
    alternatives: ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, text: `Texto ${letter}`, isCorrect: letter === 'C' })),
  };
}

test('mantém a resposta e desloca sua posição nas variantes', () => {
  const variants = buildVariants([question()], 5);
  const answers = variants.map((variant) => buildAnswerKey(variant)[0].answer);
  assert.deepEqual(answers, ['C', 'D', 'E', 'A', 'B']);
  assert.equal(new Set(answers).size, 5);
});

test('embaralhamento de incorretas é determinístico', () => {
  const original = buildVariant(question(), 0, true);
  assert.deepEqual(original.alternatives.map((alternative) => alternative.letter), ['A', 'B', 'C', 'D', 'E']);
  const first = buildVariant(question(), 2, true);
  const second = buildVariant(question(), 2, true);
  assert.deepEqual(first.alternatives, second.alternatives);
  assert.equal(first.correctAlternative, 'E');
});

test('limita variantes ao intervalo de 1 a 5', () => {
  assert.equal(buildVariants([question()], 0).length, 1);
  assert.equal(buildVariants([question()], 8).length, 5);
});
