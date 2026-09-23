import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { resolveAssetUrl } from './assets.js';

marked.setOptions({ breaks: true, gfm: true });

function resolveImageSources(html) {
  return html.replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (match, before, src, after) => {
    const resolved = resolveAssetUrl(src, { absolute: true });
    return `${before}${resolved}${after}`;
  });
}

export function renderMarkdown(value) {
  if (!value) return '';
  const html = marked.parse(value);
  return DOMPurify.sanitize(resolveImageSources(html));
}

export function plainText(value) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMarkdown(value);
  return wrapper.textContent?.trim() ?? '';
}
