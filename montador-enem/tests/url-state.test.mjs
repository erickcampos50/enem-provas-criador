import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFilterUrl, filtersFromSearchParams, filtersToSearchParams } from '../src/url-state.js';

const FULL_FILTERS = {
  q: 'fotossíntese urbanização',
  year: '2025',
  discipline: 'ciencias-natureza',
  language: '',
  difficulty: 'dificil',
  hasImages: true,
  hideSelected: true,
};

test('serializa todos os filtros e a página na URL', () => {
  const params = filtersToSearchParams(FULL_FILTERS, 3);
  assert.equal(params.get('q'), 'fotossíntese urbanização');
  assert.equal(params.get('ano'), '2025');
  assert.equal(params.get('area'), 'ciencias-natureza');
  assert.equal(params.get('dificuldade'), 'dificil');
  assert.equal(params.get('imagens'), '1');
  assert.equal(params.get('ocultar'), '1');
  assert.equal(params.get('pagina'), '3');
});

test('faz round-trip dos filtros', () => {
  const parsed = filtersFromSearchParams(filtersToSearchParams(FULL_FILTERS, 2).toString());
  assert.deepEqual(parsed.filters, FULL_FILTERS);
  assert.equal(parsed.page, 2);
});

test('omite filtros vazios e a primeira página', () => {
  const params = filtersToSearchParams({}, 1);
  assert.equal(params.toString(), '');
  assert.equal(
    filtersToSearchParams(
      { q: '  ', year: '', discipline: '', language: '', difficulty: '', hasImages: false, hideSelected: false },
      1,
    ).toString(),
    '',
  );
});

test('codifica idioma como área combinada', () => {
  const params = filtersToSearchParams({ ...FULL_FILTERS, discipline: '', language: 'ingles' });
  assert.equal(params.get('area'), 'lang:ingles');
  const parsed = filtersFromSearchParams(params.toString());
  assert.equal(parsed.filters.discipline, '');
  assert.equal(parsed.filters.language, 'ingles');
});

test('aceita variações de booleano e página inválida', () => {
  const parsed = filtersFromSearchParams('?imagens=true&ocultar=sim&pagina=0');
  assert.equal(parsed.filters.hasImages, true);
  assert.equal(parsed.filters.hideSelected, true);
  assert.equal(parsed.page, 1);
});

test('preserva hash e parâmetros desconhecidos ao montar a URL', () => {
  const url = buildFilterUrl(
    'https://example.test/app/?utm_source=teste&ano=2020&q=antiga#prova=abc',
    { ...FULL_FILTERS, year: '2025' },
    1,
  );
  const parsedUrl = new URL(url);
  assert.equal(parsedUrl.searchParams.get('utm_source'), 'teste');
  assert.equal(parsedUrl.searchParams.get('ano'), '2025');
  assert.equal(parsedUrl.searchParams.get('q'), 'fotossíntese urbanização');
  assert.equal(parsedUrl.searchParams.get('pagina'), null);
  assert.equal(parsedUrl.hash, '#prova=abc');
  assert.equal(parsedUrl.searchParams.getAll('ano').length, 1);
  assert.equal(parsedUrl.searchParams.getAll('q').length, 1);
});

test('remove filtros antigos quando o estado fica vazio', () => {
  const url = buildFilterUrl('https://example.test/app/?q=antiga&ano=2020&imagens=1&pagina=2', {}, 1);
  assert.equal(url, 'https://example.test/app/');
});
