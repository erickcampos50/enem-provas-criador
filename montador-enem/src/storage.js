const DRAFT_KEY = 'montador-enem:draft:v1';

export function readDraft() {
  try {
    const value = localStorage.getItem(DRAFT_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export function writeDraft(state) {
  const serializable = {
    version: 1,
    savedAt: new Date().toISOString(),
    header: state.header,
    selected: state.selected,
    variantsCount: state.variantsCount,
    shuffleIncorrect: state.shuffleIncorrect,
    includeAnswerSheet: state.includeAnswerSheet,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(serializable));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function exportBackup(state) {
  return JSON.stringify(
    {
      type: 'montador-enem-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      header: state.header,
      selected: state.selected,
      variantsCount: state.variantsCount,
      shuffleIncorrect: state.shuffleIncorrect,
      includeAnswerSheet: state.includeAnswerSheet,
    },
    null,
    2,
  );
}

export function parseBackup(text) {
  const value = JSON.parse(text);
  if (value?.type !== 'montador-enem-backup' || value.version !== 1) {
    throw new Error('Arquivo de backup incompatível.');
  }
  if (!Array.isArray(value.selected) || !value.header || typeof value.header !== 'object' || Array.isArray(value.header)) {
    throw new Error('Arquivo de backup inválido.');
  }
  return value;
}

export function downloadText(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
