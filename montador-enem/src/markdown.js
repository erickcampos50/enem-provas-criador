import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

export function renderMarkdown(value) {
  if (!value) return '';
  return DOMPurify.sanitize(marked.parse(value));
}

export function plainText(value) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderMarkdown(value);
  return wrapper.textContent?.trim() ?? '';
}
