import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { resolveAssetUrl } from './assets.js';

marked.setOptions({ breaks: true, gfm: true });

// Some ENEM alternatives are just "1."/"2." (e.g. Q165/2025). Left as-is,
// Marked reads them as an ordered-list marker and renders an empty bullet.
const BARE_ORDERED_MARKER = /^(\s*)(\d+)([.)])(\s*)$/;

export function escapeBareOrderedMarker(value) {
  return value.replace(BARE_ORDERED_MARKER, (_, leading, number, delimiter, trailing) =>
    `${leading}${number}\\${delimiter}${trailing}`);
}

function resolveImageSources(html) {
  return html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (match, before, src, after) => {
    const resolved = resolveAssetUrl(src, { absolute: true });
    return `${before}${resolved}${after}`;
  });
}

export function renderMarkdown(value) {
  if (!value) return '';
  const html = marked.parse(escapeBareOrderedMarker(value));
  return DOMPurify.sanitize(resolveImageSources(html));
}

export function plainText(value) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMarkdown(value);
  return wrapper.textContent?.trim() ?? '';
}
