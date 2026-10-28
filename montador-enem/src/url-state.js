/**
 * Serialização dos filtros de busca na URL.
 *
 * A URL é a fonte da verdade da visualização: ao aplicar um filtro os
 * parâmetros são gravados e, ao recarregar ou abrir um link, o estado é
 * reconstruído a partir deles. Parâmetros desconhecidos são preservados.
 */

const PARAM = Object.freeze({
  query: 'q',
  year: 'ano',
  area: 'area',
  difficulty: 'dificuldade',
  hasImages: 'imagens',
  hideSelected: 'ocultar',
  page: 'pagina',
});

const KNOWN_PARAMS = Object.freeze(Object.values(PARAM));

function text(value) {
  return String(value ?? '').trim();
}

function isTruthy(value) {
  const normalized = text(value).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'sim';
}

function positiveInteger(value) {
  const parsed = Number(text(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function filtersToSearchParams(filters = {}, page = 1) {
  const params = new URLSearchParams();
  const query = text(filters.q);
  if (query) params.set(PARAM.query, query);

  const year = text(filters.year);
  if (year) params.set(PARAM.year, year);

  const area = text(filters.language) ? `lang:${text(filters.language)}` : text(filters.discipline);
  if (area) params.set(PARAM.area, area);

  const difficulty = text(filters.difficulty);
  if (difficulty) params.set(PARAM.difficulty, difficulty);

  if (filters.hasImages) params.set(PARAM.hasImages, '1');
  if (filters.hideSelected) params.set(PARAM.hideSelected, '1');

  const currentPage = positiveInteger(page);
  if (currentPage && currentPage > 1) params.set(PARAM.page, String(currentPage));

  return params;
}

export function filtersFromSearchParams(search = '') {
  const params = search instanceof URLSearchParams ? search : new URLSearchParams(search);
  const area = text(params.get(PARAM.area));
  const language = area.startsWith('lang:') ? text(area.slice('lang:'.length)) : '';

  return {
    filters: {
      q: text(params.get(PARAM.query)),
      year: text(params.get(PARAM.year)),
      discipline: language ? '' : area,
      language,
      difficulty: text(params.get(PARAM.difficulty)),
      hasImages: isTruthy(params.get(PARAM.hasImages)),
      hideSelected: isTruthy(params.get(PARAM.hideSelected)),
    },
    page: positiveInteger(params.get(PARAM.page)) ?? 1,
  };
}

export function buildFilterUrl(baseUrl, filters = {}, page = 1) {
  const url = new URL(baseUrl ?? 'http://localhost/', baseUrl || undefined);
  for (const key of KNOWN_PARAMS) url.searchParams.delete(key);
  for (const [key, value] of filtersToSearchParams(filters, page)) {
    url.searchParams.append(key, value);
  }
  return url.href;
}

export { PARAM as FILTER_PARAMS };
