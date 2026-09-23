/**
 * Portable asset URL scheme.
 *
 * Canonical form stored in the database:
 *   asset:media/<year>/questions/<index>[-<lang>]/<filename>
 *
 * Hosting is resolved at runtime from ASSET_BASES so the same database works
 * on GitHub Pages, a CDN, a mirror, or local dev without rewriting rows.
 */

const DEFAULT_PAGES_BASE = 'https://erickcampos50.github.io/enem-provas-criador/';
const ASSET_PREFIX = 'asset:';
const REMOTE_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

function stripTrailingSlashes(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

function ensureTrailingSlash(value) {
  const trimmed = stripTrailingSlashes(value);
  return trimmed ? `${trimmed}/` : '';
}

function normalizeAssetKey(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith(ASSET_PREFIX)) {
    return `${ASSET_PREFIX}${raw.slice(ASSET_PREFIX.length).replace(/^\/+/, '')}`;
  }
  // Bare path (legacy rewrite or hand-edited row) is treated as an asset key.
  if (!REMOTE_PATTERN.test(raw) && !raw.startsWith('//')) {
    let path = raw.replace(/^\/+/, '');
    // Canonical media lives under media/<year>/questions/...
    if (!path.startsWith('media/') && /^\d{4}\//.test(path)) {
      path = `media/${path}`;
    }
    return `${ASSET_PREFIX}${path}`;
  }
  return raw;
}

function assetPath(value) {
  const key = normalizeAssetKey(value);
  return key.startsWith(ASSET_PREFIX) ? key.slice(ASSET_PREFIX.length) : '';
}

function joinBase(base, path) {
  const prefix = ensureTrailingSlash(base);
  return `${prefix}${String(path).replace(/^\/+/, '')}`;
}

function envBase() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (import.meta.env.VITE_ASSET_BASE_URL) {
        return String(import.meta.env.VITE_ASSET_BASE_URL);
      }
      if (import.meta.env.BASE_URL) {
        return String(import.meta.env.BASE_URL);
      }
    }
  } catch {
    // import.meta.env is unavailable outside Vite; fall through.
  }
  return '';
}

function documentBase() {
  if (typeof document !== 'undefined' && document.baseURI) {
    return document.baseURI;
  }
  return '';
}

/**
 * Ordered hosting bases. First successful load wins; callers may iterate
 * candidates via `assetCandidates` for <img onerror> fallback.
 */
export function getAssetBases({ extras = [] } = {}) {
  const bases = [];
  const push = (value) => {
    const base = ensureTrailingSlash(value);
    if (base && !bases.includes(base)) {
      bases.push(base);
    }
  };

  for (const extra of extras) {
    push(extra);
  }
  push(envBase());
  push(documentBase());
  push(DEFAULT_PAGES_BASE);
  // Relative root keeps same-origin dev working even without BASE_URL.
  push('/');

  return bases;
}

export function toAssetKey(value) {
  return normalizeAssetKey(value);
}

export function isRemoteUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return false;
  }
  if (raw.startsWith(ASSET_PREFIX)) {
    return false;
  }
  return REMOTE_PATTERN.test(raw) || raw.startsWith('//');
}

function isAbsoluteHttp(base) {
  return /^https?:\/\//i.test(String(base ?? ''));
}

/**
 * Resolve a stored image reference to a concrete URL (first candidate).
 * Remote http(s) URLs are returned unchanged.
 *
 * `options.absolute` forces an http(s) base (for print windows / exported HTML
 * that are not on the app origin).
 */
export function resolveAssetUrl(value, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  if (isRemoteUrl(raw)) {
    return raw;
  }
  const path = assetPath(raw);
  const bases = getAssetBases(options);
  let primary = bases[0];
  if (options.absolute) {
    primary = bases.find((base) => isAbsoluteHttp(base)) ?? DEFAULT_PAGES_BASE;
  }
  return joinBase(primary || DEFAULT_PAGES_BASE, path);
}

/**
 * All hosting candidates for a stored reference, in fallback order.
 * Remote URLs yield a single-element array.
 */
export function assetCandidates(value, options = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return [];
  }
  if (isRemoteUrl(raw)) {
    return [raw];
  }
  const path = assetPath(raw);
  return getAssetBases(options).map((base) => joinBase(base, path));
}

/**
 * Resolve every image reference in a list (question files, alt files, …).
 */
export function resolveAssetUrlList(values, options = {}) {
  return (values ?? []).map((value) => resolveAssetUrl(value, options));
}

export const ASSET_URL_SCHEME = Object.freeze({
  prefix: ASSET_PREFIX,
  defaultPagesBase: DEFAULT_PAGES_BASE,
  mediaRoot: 'media',
});

export function mediaAssetKey(year, questionFolder, filename) {
  return `${ASSET_PREFIX}media/${year}/questions/${questionFolder}/${filename}`;
}
