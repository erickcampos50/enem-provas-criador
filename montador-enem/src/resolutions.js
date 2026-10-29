function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

function trustedUrl(value, host) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function hasResolution(resolution) {
  return Boolean(resolution?.body?.trim());
}

// Keep the CSV's linear formulas literally: Markdown would eat underscores,
// interpret inequalities as HTML, and turn some calculations into lists.
export function renderResolution(resolution, visible = false) {
  if (!visible || !hasResolution(resolution)) return '';
  let body = '', offset = 0;
  for (const match of resolution.body.matchAll(/\[imagem:\s*([^\]]+)\]/gi)) {
    body += escapeHtml(resolution.body.slice(offset, match.index));
    const url = trustedUrl(match[1].trim(), 'azstgpoliedroresolveprd.blob.core.windows.net');
    body += url ? `<img src="${escapeHtml(url)}" alt="Ilustração da resolução" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml(match[0]);
    offset = match.index + match[0].length;
  }
  body += escapeHtml(resolution.body.slice(offset));
  const cancelled = resolution.sourceAnswer === 'ANL'
    ? '<p class="alert alert-warning py-2">Questão anulada. A resolução é mantida para estudo.</p>' : '';
  return `<section class="question-resolution mt-4 pt-3 border-top" aria-labelledby="question-resolution-title"><h4 class="h5" id="question-resolution-title">Resolução</h4>${cancelled}<div class="resolution-body">${body}</div></section>`;
}
