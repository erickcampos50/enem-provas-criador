const DRAFT_KEY = 'montador-enem:draft:v1';
const WELCOME_KEY = 'montador-enem:welcome-dismissed:v1';
const PROOF_TYPE = 'montador-enem-proof';
const PROOF_LINK_TYPE = 'montador-enem-proof-link';
const PROOF_VERSION = 1;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function proofPayload(state, databaseHash = state.database?.sha256 ?? '') {
  return {
    version: PROOF_VERSION,
    databaseHash: databaseHash || undefined,
    header: state.header,
    selected: state.selected,
    variantsCount: state.variantsCount,
    shuffleIncorrect: Boolean(state.shuffleIncorrect),
    includeAnswerSheet: state.includeAnswerSheet !== false,
  };
}

function normalizeProof(value, { link = false } = {}) {
  const expectedType = link ? PROOF_LINK_TYPE : null;
  const acceptedTypes = link ? [PROOF_LINK_TYPE] : [PROOF_TYPE, 'montador-enem-backup'];
  if (!isRecord(value) || !acceptedTypes.includes(value.type) || value.version !== PROOF_VERSION) {
    throw new Error('Arquivo ou link de prova incompatível.');
  }
  if (expectedType && value.type !== expectedType) throw new Error('Link de prova incompatível.');
  if (!isRecord(value.header)) throw new Error('A identificação da prova é inválida.');
  if (!Array.isArray(value.selected)) throw new Error('A lista de questões da prova é inválida.');
  const selected = value.selected.map((item) => {
    if (!isRecord(item) || !Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0) {
      throw new Error('A lista de questões da prova contém um identificador inválido.');
    }
    const points = Number(item.points ?? 1);
    if (!Number.isFinite(points) || points < 0) throw new Error('A pontuação de uma questão é inválida.');
    return { id: Number(item.id), points };
  });
  const variantsCount = Number(value.variantsCount ?? 1);
  if (!Number.isInteger(variantsCount) || variantsCount < 1 || variantsCount > 5) {
    throw new Error('A quantidade de variantes deve estar entre 1 e 5.');
  }
  if (link && typeof value.databaseHash !== 'string' || link && !value.databaseHash) {
    throw new Error('O link não informa a versão da base de questões.');
  }
  return {
    version: PROOF_VERSION,
    type: expectedType ?? PROOF_TYPE,
    databaseHash: typeof value.databaseHash === 'string' ? value.databaseHash : '',
    header: { ...value.header },
    selected,
    variantsCount,
    shuffleIncorrect: Boolean(value.shuffleIncorrect),
    includeAnswerSheet: value.includeAnswerSheet !== false,
    savedAt: value.savedAt,
  };
}

export function readDraft() {
  try {
    const value = localStorage.getItem(DRAFT_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function writeDraft(state) {
  const savedAt = new Date().toISOString();
  localStorage.setItem(DRAFT_KEY, JSON.stringify({
    version: PROOF_VERSION,
    savedAt,
    header: state.header,
    selected: state.selected,
    variantsCount: state.variantsCount,
    shuffleIncorrect: state.shuffleIncorrect,
    includeAnswerSheet: state.includeAnswerSheet,
  }));
  return savedAt;
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function shouldShowWelcome() {
  try {
    return localStorage.getItem(WELCOME_KEY) !== '1';
  } catch {
    return true;
  }
}

export function dismissWelcome() {
  localStorage.setItem(WELCOME_KEY, '1');
}

export function exportProof(state) {
  return JSON.stringify({
    type: PROOF_TYPE,
    exportedAt: new Date().toISOString(),
    ...proofPayload(state),
  }, null, 2);
}

export function exportBackup(state) {
  return exportProof(state);
}

export function parseProof(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('O arquivo da prova não contém JSON válido.');
  }
  return normalizeProof(value);
}

export function parseBackup(text) {
  return parseProof(text);
}

function encodeBase64Url(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeProofLink(state, databaseHash, baseUrl = globalThis.location?.href) {
  if (!databaseHash) throw new Error('A versão da base é necessária para criar o link.');
  const payload = { type: PROOF_LINK_TYPE, ...proofPayload(state, databaseHash) };
  const url = new URL(baseUrl || 'http://localhost/', baseUrl || undefined);
  url.hash = 'prova=' + encodeBase64Url(JSON.stringify(payload));
  return url.href;
}

export function parseProofLink(value) {
  const input = String(value ?? '');
  const hash = input.startsWith('#') ? input : new URL(input, 'http://localhost/').hash;
  const match = hash.match(/^#?prova=([^&]+)/);
  if (!match) return null;
  try {
    return normalizeProof(JSON.parse(decodeBase64Url(match[1])), { link: true });
  } catch (error) {
    if (error instanceof Error && /incompatível|inválid|versão|identificador|pontuação|quantidade/.test(error.message)) throw error;
    throw new Error('O link da prova está corrompido ou incompleto.');
  }
}

export function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
