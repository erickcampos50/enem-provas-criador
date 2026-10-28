import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeBareOrderedMarker } from '../src/markdown.js';

test('escapa alternativas que são apenas um marcador de lista', () => {
  assert.equal(escapeBareOrderedMarker('1.'), '1\\.');
  assert.equal(escapeBareOrderedMarker(' 2) '), ' 2\\) ');
});

test('não altera textos que não são apenas um marcador', () => {
  assert.equal(escapeBareOrderedMarker('1. Grupo A'), '1. Grupo A');
  assert.equal(escapeBareOrderedMarker('1.5'), '1.5');
  assert.equal(escapeBareOrderedMarker('Grupo 1.'), 'Grupo 1.');
});
