const CACHE_PREFIX = 'montador-enem:sqlite:';

function assetUrl(filename) {
  return new URL(filename, document.baseURI).toString();
}

async function responseBytes(response) {
  return response.arrayBuffer();
}

export async function loadDatabaseBytes() {
  const manifestResponse = await fetch(assetUrl('enem.sqlite.meta.json'), { cache: 'no-cache' });
  if (!manifestResponse.ok) throw new Error('Manifesto do banco não encontrado. Execute o build de sincronização.');
  const manifest = await manifestResponse.json();
  const cacheName = `${CACHE_PREFIX}${manifest.sha256}`;

  if (!('caches' in globalThis)) {
    const response = await fetch(assetUrl('enem.sqlite'), { cache: 'no-cache' });
    if (!response.ok) throw new Error('Não foi possível baixar o banco SQLite.');
    return { bytes: await responseBytes(response), manifest, cached: false };
  }

  const cache = await caches.open(cacheName);
  const cacheKey = assetUrl('enem.sqlite');
  let response = await cache.match(cacheKey);
  let cached = Boolean(response);
  if (!response) {
    response = await fetch(cacheKey, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Não foi possível baixar o banco SQLite.');
    // Cache.put is best-effort: some browsers reject certain responses
    // (empty Content-Type in Vite dev, opaque/redirected, quota).
    // Never block app startup on cache write failures.
    try {
      await cache.put(cacheKey, response.clone());
      cached = false;
    } catch {
      cached = false;
    }
  }

  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName)
        .map((name) => caches.delete(name)),
    );
  } catch {
    // ignore cache cleanup errors
  }
  return { bytes: await responseBytes(response), manifest, cached };
}
