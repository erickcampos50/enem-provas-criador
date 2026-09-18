const CACHE_PREFIX = 'montador-enem:sqlite:';

async function responseBytes(response) {
  return response.arrayBuffer();
}

export async function loadDatabaseBytes() {
  const manifestResponse = await fetch('/enem.sqlite.meta.json', { cache: 'no-cache' });
  if (!manifestResponse.ok) throw new Error('Manifesto do banco não encontrado. Execute o build de sincronização.');
  const manifest = await manifestResponse.json();
  const cacheName = `${CACHE_PREFIX}${manifest.sha256}`;

  if (!('caches' in globalThis)) {
    const response = await fetch('/enem.sqlite', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Não foi possível baixar o banco SQLite.');
    return { bytes: await responseBytes(response), manifest, cached: false };
  }

  const cache = await caches.open(cacheName);
  let response = await cache.match('/enem.sqlite');
  let cached = Boolean(response);
  if (!response) {
    response = await fetch('/enem.sqlite', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Não foi possível baixar o banco SQLite.');
    await cache.put('/enem.sqlite', response.clone());
    cached = false;
  }

  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== cacheName).map((name) => caches.delete(name)));
  return { bytes: await responseBytes(response), manifest, cached };
}
