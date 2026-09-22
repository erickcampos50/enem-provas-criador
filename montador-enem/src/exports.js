import JSZip from 'jszip';
import { renderMarkdown } from './markdown.js';
import { buildAnswerKey } from './variants.js';

const PRINT_CSS = `
@page { size: A4 portrait; margin: 18mm 15mm 15mm; }
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f2f2f2; color: #222; font: 10.5pt/1.48 Arial, Helvetica, sans-serif; orphans: 3; widows: 3; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.exam-page { max-width: 180mm; margin: 0 auto; background: #fff; }
.exam-header { border: 1px solid #bdbdbd; border-top: 7px solid #222; border-radius: 5px; overflow: hidden; margin-bottom: 8mm; box-shadow: 0 2px 8px rgba(0, 0, 0, .08); }
.exam-header-top { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 7mm 8mm 6mm; background: linear-gradient(135deg, #f5f5f5 0%, #e8e8e8 100%); }
.exam-brand { display: flex; align-items: center; gap: 4mm; min-width: 0; }
.exam-brand-mark { display: grid; place-items: center; width: 17mm; height: 17mm; border-radius: 50%; background: #555; color: #222; font-size: 17pt; font-weight: 800; letter-spacing: -.04em; }
.exam-kicker { color: #666; font-size: 7.5pt; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.exam-title { margin: 1mm 0 0; color: #222; font-size: 21pt; line-height: 1.08; font-weight: 800; }
.exam-subtitle { margin-top: 1.5mm; color: #666; font-size: 9pt; }
.exam-variant { flex: 0 0 auto; min-width: 25mm; padding: 3mm 4mm; border: 1px solid #555; border-radius: 4px; color: #222; text-align: center; text-transform: uppercase; }
.exam-variant-label { display: block; color: #666; font-size: 7pt; font-weight: 700; letter-spacing: .12em; }
.exam-variant-value { display: block; margin-top: 1mm; font-size: 18pt; line-height: 1; font-weight: 800; }
.exam-meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); border-top: 1px solid #bdbdbd; }
.exam-meta-item { min-height: 17mm; padding: 3mm 4mm; border-right: 1px solid #ddd; }
.exam-meta-item:nth-child(4n) { border-right: 0; }
.exam-meta-label { display: block; color: #666; font-size: 7.5pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.exam-meta-value { display: block; margin-top: 1mm; color: #222; font-weight: 700; overflow-wrap: anywhere; }
.exam-instructions { margin: 5mm 8mm 6mm; padding: 4mm 5mm; border-left: 3px solid #555; background: #f5f5f5; }
.exam-instructions-label { margin-bottom: 1.5mm; color: #444; font-size: 7.5pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.exam-instructions p { margin: 0; }
.student-identification { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 5mm; margin: 0 0 8mm; padding: 5mm; border: 1px solid #bdbdbd; border-radius: 4px; }
.student-field { min-height: 12mm; }
.student-field-label { display: block; color: #666; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; }
.student-field-value { display: block; min-height: 7mm; padding-top: 2mm; border-bottom: 1px solid #555; font-weight: 700; }
.exam-question { break-inside: avoid; margin: 0 0 7mm; padding: 0 0 5mm; border-bottom: 1px solid #d2d2d2; }
.question-heading { display: flex; align-items: center; gap: 4mm; margin-bottom: 4mm; }
.question-index { display: grid; place-items: center; flex: 0 0 12mm; height: 12mm; border-radius: 3px; background: #222; color: #fff; font-size: 14pt; font-weight: 800; }
.question-heading-meta { min-width: 0; }
.question-source { margin: 0; color: #777; font-size: 8.5pt; font-style: italic; font-weight: 400; line-height: 1.25; }
.question-points { margin-left: auto; padding: 1.5mm 3mm; border: 1px solid #bdbdbd; border-radius: 999px; color: #666; font-size: 8pt; white-space: nowrap; }
.question-context, .alternatives-introduction { margin-bottom: 3mm; }
.question-context p, .alternatives-introduction p { margin: 0 0 2.5mm; }
.question-context p:last-child, .alternatives-introduction p:last-child { margin-bottom: 0; }
.alternative { display: flex; align-items: flex-start; gap: 3mm; margin: 2mm 0; padding: 2.5mm 3mm; border: 1px solid #d2d2d2; border-radius: 3px; }
.alternative > div { flex: 1; min-width: 0; }
.alternative p { margin: 0 0 2mm; }
.alternative p:last-child { margin-bottom: 0; }
.alternative-letter { display: grid; place-items: center; flex: 0 0 7mm; height: 7mm; border: 1px solid #222; border-radius: 50%; color: #222; font-weight: 800; }
.correct-tag { display: inline-block; margin-top: 1.5mm; padding: .75mm 2mm; border-radius: 999px; background: #e8e8e8; color: #222; font-size: 7pt; font-weight: 800; text-transform: uppercase; }
.teacher-answer { border-color: #777; background: #f1f1f1; }
.exam-question, .question-context, .alternatives-introduction, .alternative, .alternative > div { min-width: 0; max-width: 100%; }
.exam-page img { display: block; box-sizing: border-box; width: auto; max-width: 100%; height: auto; }
.question-image { display: block; width: auto; max-width: 100%; max-height: 88mm; object-fit: contain; margin: 4mm auto; }
.page-break { break-before: page; page-break-before: always; }
.answer-sheet, .answer-key { padding-top: 2mm; }
.answer-sheet-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8mm; padding-bottom: 3mm; border-bottom: 2px solid #222; }
.answer-sheet-subtitle { margin: 1mm 0 0; color: #555; font-size: 9pt; }
.answer-sheet-variant { min-width: 24mm; padding: 2mm 3mm; border: 1px solid #555; text-align: center; font-size: 12pt; font-weight: 800; }
.answer-student-identification { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 3mm 5mm; margin: 4mm 0; padding: 3mm; border: 1px solid #aaa; }
.answer-student-field { min-height: 10mm; }
.answer-student-field.answer-student-name { grid-column: span 2; }
.answer-student-field.answer-student-signature { grid-column: span 2; }
.answer-student-label { display: block; color: #555; font-size: 7pt; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
.answer-student-value { display: block; min-height: 6mm; padding-top: 1.5mm; border-bottom: 1px solid #555; font-weight: 700; }
.section-kicker { color: #555; font-size: 8pt; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
.section-title { margin: 1mm 0 2mm; color: #222; font-size: 18pt; }
.section-lead { margin: 0 0 5mm; color: #666; }
.answer-sheet-table, .answer-key-table { width: 100%; border-collapse: separate; border-spacing: 0; overflow: hidden; border: 1px solid #aaa; border-radius: 4px; }
.answer-sheet-table th, .answer-sheet-table td, .answer-key-table th, .answer-key-table td { padding: 3mm 2.5mm; border-right: 1px solid #d2d2d2; border-bottom: 1px solid #d2d2d2; text-align: center; }
.answer-sheet-table th, .answer-key-table th { background: #222; color: #fff; font-size: 8pt; letter-spacing: .05em; text-transform: uppercase; }
.answer-sheet-table tr:last-child td, .answer-key-table tr:last-child td { border-bottom: 0; }
.answer-sheet-table th:last-child, .answer-sheet-table td:last-child, .answer-key-table th:last-child, .answer-key-table td:last-child { border-right: 0; }
.answer-sheet-table td:first-child, .answer-key-table td:nth-child(1), .answer-key-table td:nth-child(4) { color: #222; font-weight: 800; }
.answer-sheet-table td:not(:first-child) { width: 14%; }
.answer-bubble { display: inline-grid; place-items: center; width: 7mm; height: 7mm; border: 1px solid #666; border-radius: 50%; color: #555; font-size: 8pt; font-weight: 700; }
.answer-key-table th:nth-child(1), .answer-key-table th:nth-child(4) { width: 12%; }
.answer-key-table th:nth-child(2), .answer-key-table th:nth-child(5) { width: 18%; }
.answer-key-table th:nth-child(3), .answer-key-table th:nth-child(6) { width: 20%; }
.answer-key-answer { color: #222; font-size: 13pt; font-weight: 800; }
.answer-key-points { color: #666; }
.answer-key-total { display: flex; justify-content: flex-end; gap: 8mm; margin-top: 5mm; padding: 4mm 5mm; border: 1px solid #555; background: #f5f5f5; color: #222; font-weight: 800; }
table { width: 100%; table-layout: fixed; font-size: 9pt; }
thead { display: table-header-group; }
.answer-sheet-table th, .answer-sheet-table td { padding: 1.7mm 1.5mm; }
@media print { body { background: #fff; } .exam-page { max-width: none; } .exam-header { box-shadow: none; } }
@media screen { body { padding: 12mm 0; } .exam-page { padding: 12mm 15mm; box-shadow: 0 3px 20px rgba(0, 0, 0, .12); } }
`;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function imageMarkup(url, alt) {
  if (!url) return '';
  return `<img class="question-image" src="${escapeHtml(url)}" alt="${escapeHtml(alt)}">`;
}

function imageUrlsFromText(value) {
  const urls = [];
  const text = String(value ?? '');
  const markdownPattern = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))[^)]*\)/g;
  const htmlPattern = /<img\b[^>]*\bsrc=[\"']([^\"']+)[\"'][^>]*>/gi;
  for (const match of text.matchAll(markdownPattern)) urls.push(match[1] ?? match[2]);
  for (const match of text.matchAll(htmlPattern)) urls.push(match[1]);
  return urls;
}

/**
 * question_files is a normalized copy of images that may already be embedded
 * in the Markdown context. Keep the embedded image and only render files that
 * are not already present in the textual content.
 */
export function getUniqueQuestionFiles(question) {
  const inlineUrls = new Set([
    ...imageUrlsFromText(question?.context),
    ...imageUrlsFromText(question?.alternativesIntroduction),
    ...(question?.alternatives ?? []).flatMap((alternative) => imageUrlsFromText(alternative.text)),
  ].filter(Boolean));
  const seen = new Set(inlineUrls);
  return (question?.files ?? []).filter((url) => {
    if (!url) return false;
    const key = String(url).trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatQuestionSource(value) {
  return String(value ?? '')
    .trim()
    .replace(/^quest[aã]o\s+\d+\s*(?:[-–—:]\s*)?/i, '')
    .trim();
}

export function formatQuestionOriginHeading(question) {
  const number = Number(question?.number);
  const year = Number(question?.year);
  const hasNumber = Number.isFinite(number);
  const hasYear = Number.isFinite(year);
  const prefix = [
    hasNumber ? 'Q' + number : null,
    hasYear ? String(year) : null,
  ].filter(Boolean).join(' ');

  let descriptor = formatQuestionSource(question?.title);
  if (hasNumber) {
    descriptor = descriptor
      .replace(new RegExp('\\s*(?:[·•|/\\-–—:]\\s*)?Quest[aã]o\\s+' + number + '\\s*
  return prefix || descriptor;
}

function questionHtml(question, number, teacher) {
  const alternatives = (question.alternatives ?? []).map((alternative) => {
    const alternativeFile = alternative.file ?? alternative.fileUrl;
    const answerTag = teacher && alternative.isCorrect ? '<span class="correct-tag">Resposta correta</span>' : '';
    const content = alternative.text
      ? renderMarkdown(alternative.text)
      : alternativeFile
        ? imageMarkup(alternativeFile, 'Imagem da alternativa ' + alternative.letter)
        : '<span>Sem texto ou imagem.</span>';
    return '<div class="alternative ' + (teacher && alternative.isCorrect ? 'teacher-answer' : '') + '">' +
      '<span class="alternative-letter">' + escapeHtml(alternative.letter) + '</span>' +
      '<div>' + content + answerTag + '</div>' +
      '</div>';
  }).join('');
  const files = getUniqueQuestionFiles(question).map((url, index) => imageMarkup(url, 'Imagem de apoio ' + (index + 1))).join('');
  const points = formatPoints(question.points ?? 1);
  const source = formatQuestionOriginHeading(question);
  const sourceMarkup = source ? '<div class="question-source">' + escapeHtml(source) + '</div>' : '';
  return '<section class="exam-question">' +
    '<div class="question-heading">' +
      '<span class="question-index">' + String(number).padStart(2, '0') + '</span>' +
      '<div class="question-heading-meta">' + sourceMarkup + '</div>' +
      '<span class="question-points">' + points + ' ponto' + (Number(question.points ?? 1) === 1 ? '' : 's') + '</span>' +
    '</div>' +
    '<div class="question-context">' + renderMarkdown(question.context) + '</div>' + files +
    '<div class="alternatives-introduction">' + renderMarkdown(question.alternativesIntroduction) + '</div>' + alternatives +
  '</section>';
}

function answerSheet(header, variant) {
  const field = (label, value, className = '') => '<div class="answer-student-field ' + className + '"><span class="answer-student-label">' + label + '</span><span class="answer-student-value">' + (value ? escapeHtml(value) : '&nbsp;') + '</span></div>';
  const rows = variant.questions.map((_, index) => {
    const cells = ['A', 'B', 'C', 'D', 'E'].map((letter) => '<td><span class="answer-bubble">' + letter + '</span></td>').join('');
    return '<tr><td>' + (index + 1) + '</td>' + cells + '</tr>';
  }).join('');
  return '<section class="answer-sheet page-break">' +
    '<div class="answer-sheet-header"><div><div class="section-kicker">Documento do aluno</div><h2 class="section-title">Folha de respostas</h2><p class="answer-sheet-subtitle">' + headerValue(header.title || 'Avaliação') + ' · Variante ' + escapeHtml(variant.label) + '</p></div><div class="answer-sheet-variant">' + escapeHtml(variant.label) + '</div></div>' +
    '<div class="answer-student-identification">' + field('Nome completo', '', 'answer-student-name') + field('Matrícula / RA') + field('Turma', header.className) + field('Data', header.date) + field('Assinatura do aluno', '', 'answer-student-signature') + '</div>' +
    '<table class="answer-sheet-table"><thead><tr><th>Questão</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead><tbody>' + rows + '</tbody></table>' +
  '</section>';
}

function formatPoints(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '1';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function headerValue(value) {
  return value ? escapeHtml(value) : '—';
}

function studentIdentification(header) {
  const field = (label, value = '') => '<div class="student-field"><span class="student-field-label">' + label + '</span><span class="student-field-value">' + (value ? escapeHtml(value) : '&nbsp;') + '</span></div>';
  return '<section class="student-identification">' +
    field('Nome completo') + field('Turma', header.className) + field('Data', header.date) +
  '</section>';
}

function headerHtml(header, variant, teacher) {
  const metadata = [
    ['Disciplina', header.subject],
    ['Professor(a)', header.teacher],
    ['Turma', header.className],
    ['Data', header.date],
    ['Período', header.period],
    ['Duração', header.duration],
    ['Valor da prova', header.totalValue],
    ['Questões', variant.questions.length + ' questão(ões)'],
  ].map(([label, value]) => '<div class="exam-meta-item"><span class="exam-meta-label">' + label + '</span><strong class="exam-meta-value">' + headerValue(value) + '</strong></div>').join('');
  const instructions = header.instructions
    ? '<div class="exam-instructions"><div class="exam-instructions-label">Orientações</div>' + renderMarkdown(header.instructions) + '</div>'
    : '';
  return '<header class="exam-header">' +
    '<div class="exam-header-top"><div class="exam-brand"><span class="exam-brand-mark">AV</span><div><div class="exam-kicker">Instrumento de avaliação</div><h1 class="exam-title">' + headerValue(header.title || 'Avaliação') + '</h1><div class="exam-subtitle">' + headerValue(header.institution || 'Instituição de ensino') + '</div></div></div>' +
    '<div class="exam-variant"><span class="exam-variant-label">Variante</span><strong class="exam-variant-value">' + escapeHtml(variant.label) + '</strong></div></div>' +
    '<div class="exam-meta-grid">' + metadata + '</div>' +
    instructions +
  '</header>' + (teacher ? '' : studentIdentification(header));
}

function answerKeyCell(item) {
  if (!item) return '<td class="key-empty" colspan="3"></td>';
  return '<td>' + item.number + '</td><td class="answer-key-answer">' + escapeHtml(item.answer) + '</td><td class="answer-key-points">' + formatPoints(item.points) + '</td>';
}

function answerKeyHtml(variant) {
  const items = buildAnswerKey(variant).map((item, index) => ({ ...item, points: variant.questions[index]?.points ?? 1 }));
  const rows = [];
  for (let index = 0; index < items.length; index += 2) rows.push('<tr>' + answerKeyCell(items[index]) + answerKeyCell(items[index + 1]) + '</tr>');
  const total = variant.questions.reduce((sum, question) => sum + Number(question.points ?? 1), 0);
  return '<section class="answer-key page-break"><div class="section-kicker">Uso do professor</div><h2 class="section-title">Gabarito — Variante ' + variant.label + '</h2><p class="section-lead">Tabela de conferência da versão exportada. As respostas correspondem à ordem real das alternativas.</p>' +
    '<table class="answer-key-table"><thead><tr><th>Questão</th><th>Resposta</th><th>Pontos</th><th>Questão</th><th>Resposta</th><th>Pontos</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
    '<div class="answer-key-total"><span>Total de questões: ' + items.length + '</span><span>Total de pontos: ' + formatPoints(total) + '</span></div></section>';
}

export function renderHtmlDocument(header, variant, teacher, includeAnswerSheet) {
  const questions = variant.questions.map((question, index) => questionHtml(question, index + 1, teacher)).join('');
  const key = teacher ? answerKeyHtml(variant) : '';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(header.title || 'Avaliação') + ' — Variante ' + escapeHtml(variant.label) + '</title><style>' + PRINT_CSS + '</style></head><body><main class="exam-page">' + headerHtml(header, variant, teacher) + questions + (includeAnswerSheet ? answerSheet(header, variant) : '') + key + '</main></body></html>';
}

export function renderMarkdownDocument(header, variant, teacher, includeAnswerSheet) {
  const lines = [`# ${header.title || 'Avaliação'}`, `**Variante ${variant.label}**`, ''];
  if (header.institution) lines.push(`**Instituição:** ${header.institution}`);
  if (header.subject) lines.push(`**Disciplina:** ${header.subject}`);
  if (header.teacher) lines.push(`**Professor:** ${header.teacher}`);
  if (header.instructions) lines.push('', header.instructions);
  lines.push('');
  variant.questions.forEach((question, index) => {
    lines.push(`## ${index + 1}. ${formatQuestionOriginHeading(question)}`, '', question.context ?? '');
    getUniqueQuestionFiles(question).forEach((url, imageIndex) => lines.push('', `![Imagem de apoio ${imageIndex + 1}](${url})`));
    if (question.alternativesIntroduction) lines.push('', question.alternativesIntroduction);
    question.alternatives.forEach((alternative) => {
      const marker = teacher && alternative.isCorrect ? ' ✅' : '';
      lines.push('', `- **${alternative.letter})**${marker} ${alternative.text ?? ''}`);
      if (alternative.file) lines.push(`  ![Imagem da alternativa ${alternative.letter}](${alternative.file})`);
    });
    lines.push('');
  });
  if (includeAnswerSheet) lines.push('---', '', `## Folha de respostas — Variante ${variant.label}`, '', variant.questions.map((_, index) => `${index + 1}. ( A ) ( B ) ( C ) ( D ) ( E )`).join('\n'));
  if (teacher) {
    lines.push('', '---', '', `## Gabarito — Variante ${variant.label}`, '', '| Questão | Resposta | Pontos |', '| ---: | :---: | ---: |');
    buildAnswerKey(variant).forEach((item, index) => lines.push(`| ${item.number} | ${item.answer} | ${formatPoints(variant.questions[index]?.points ?? 1)} |`));
  }
  return lines.join('\n');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportVariants(header, variants, options = {}) {
  const files = {};
  for (const variant of variants) {
    const prefix = `prova-variante-${variant.label}`;
    files[`${prefix}-aluno.html`] = renderHtmlDocument(header, variant, false, options.includeAnswerSheet);
    files[`${prefix}-professor.html`] = renderHtmlDocument(header, variant, true, false);
    files[`${prefix}-aluno.md`] = renderMarkdownDocument(header, variant, false, options.includeAnswerSheet);
    files[`${prefix}-professor.md`] = renderMarkdownDocument(header, variant, true, false);
  }
  if (options.zip) {
    const zip = new JSZip();
    Object.entries(files).forEach(([name, content]) => zip.file(name, content));
    download(await zip.generateAsync({ type: 'blob' }), 'provas-enem.zip');
  } else {
    Object.entries(files).forEach(([name, content]) => download(new Blob([content], { type: name.endsWith('.html') ? 'text/html' : 'text/markdown' }), name));
  }
  return files;
}
, 'i'), '')
      .trim();
  }
  if (hasYear) {
    const genericSource = 'ENEM ' + year;
    if (descriptor.toLocaleUpperCase('pt-BR') === genericSource.toLocaleUpperCase('pt-BR')) {
      descriptor = '';
    }
  }

  if (prefix && descriptor) return prefix + ' — ' + descriptor;
  return prefix || descriptor;
}

function questionHtml(question, number, teacher) {
  const alternatives = (question.alternatives ?? []).map((alternative) => {
    const alternativeFile = alternative.file ?? alternative.fileUrl;
    const answerTag = teacher && alternative.isCorrect ? '<span class="correct-tag">Resposta correta</span>' : '';
    const content = alternative.text
      ? renderMarkdown(alternative.text)
      : alternativeFile
        ? imageMarkup(alternativeFile, 'Imagem da alternativa ' + alternative.letter)
        : '<span>Sem texto ou imagem.</span>';
    return '<div class="alternative ' + (teacher && alternative.isCorrect ? 'teacher-answer' : '') + '">' +
      '<span class="alternative-letter">' + escapeHtml(alternative.letter) + '</span>' +
      '<div>' + content + answerTag + '</div>' +
      '</div>';
  }).join('');
  const files = getUniqueQuestionFiles(question).map((url, index) => imageMarkup(url, 'Imagem de apoio ' + (index + 1))).join('');
  const points = formatPoints(question.points ?? 1);
  const source = formatQuestionOriginHeading(question);
  const sourceMarkup = source ? '<div class="question-source">' + escapeHtml(source) + '</div>' : '';
  return '<section class="exam-question">' +
    '<div class="question-heading">' +
      '<span class="question-index">' + String(number).padStart(2, '0') + '</span>' +
      '<div class="question-heading-meta">' + sourceMarkup + '</div>' +
      '<span class="question-points">' + points + ' ponto' + (Number(question.points ?? 1) === 1 ? '' : 's') + '</span>' +
    '</div>' +
    '<div class="question-context">' + renderMarkdown(question.context) + '</div>' + files +
    '<div class="alternatives-introduction">' + renderMarkdown(question.alternativesIntroduction) + '</div>' + alternatives +
  '</section>';
}

function answerSheet(header, variant) {
  const field = (label, value, className = '') => '<div class="answer-student-field ' + className + '"><span class="answer-student-label">' + label + '</span><span class="answer-student-value">' + (value ? escapeHtml(value) : '&nbsp;') + '</span></div>';
  const rows = variant.questions.map((_, index) => {
    const cells = ['A', 'B', 'C', 'D', 'E'].map((letter) => '<td><span class="answer-bubble">' + letter + '</span></td>').join('');
    return '<tr><td>' + (index + 1) + '</td>' + cells + '</tr>';
  }).join('');
  return '<section class="answer-sheet page-break">' +
    '<div class="answer-sheet-header"><div><div class="section-kicker">Documento do aluno</div><h2 class="section-title">Folha de respostas</h2><p class="answer-sheet-subtitle">' + headerValue(header.title || 'Avaliação') + ' · Variante ' + escapeHtml(variant.label) + '</p></div><div class="answer-sheet-variant">' + escapeHtml(variant.label) + '</div></div>' +
    '<div class="answer-student-identification">' + field('Nome completo', '', 'answer-student-name') + field('Matrícula / RA') + field('Turma', header.className) + field('Data', header.date) + field('Assinatura do aluno', '', 'answer-student-signature') + '</div>' +
    '<table class="answer-sheet-table"><thead><tr><th>Questão</th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr></thead><tbody>' + rows + '</tbody></table>' +
  '</section>';
}

function formatPoints(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '1';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function headerValue(value) {
  return value ? escapeHtml(value) : '—';
}

function studentIdentification(header) {
  const field = (label, value = '') => '<div class="student-field"><span class="student-field-label">' + label + '</span><span class="student-field-value">' + (value ? escapeHtml(value) : '&nbsp;') + '</span></div>';
  return '<section class="student-identification">' +
    field('Nome completo') + field('Turma', header.className) + field('Data', header.date) +
  '</section>';
}

function headerHtml(header, variant, teacher) {
  const metadata = [
    ['Disciplina', header.subject],
    ['Professor(a)', header.teacher],
    ['Turma', header.className],
    ['Data', header.date],
    ['Período', header.period],
    ['Duração', header.duration],
    ['Valor da prova', header.totalValue],
    ['Questões', variant.questions.length + ' questão(ões)'],
  ].map(([label, value]) => '<div class="exam-meta-item"><span class="exam-meta-label">' + label + '</span><strong class="exam-meta-value">' + headerValue(value) + '</strong></div>').join('');
  const instructions = header.instructions
    ? '<div class="exam-instructions"><div class="exam-instructions-label">Orientações</div>' + renderMarkdown(header.instructions) + '</div>'
    : '';
  return '<header class="exam-header">' +
    '<div class="exam-header-top"><div class="exam-brand"><span class="exam-brand-mark">AV</span><div><div class="exam-kicker">Instrumento de avaliação</div><h1 class="exam-title">' + headerValue(header.title || 'Avaliação') + '</h1><div class="exam-subtitle">' + headerValue(header.institution || 'Instituição de ensino') + '</div></div></div>' +
    '<div class="exam-variant"><span class="exam-variant-label">Variante</span><strong class="exam-variant-value">' + escapeHtml(variant.label) + '</strong></div></div>' +
    '<div class="exam-meta-grid">' + metadata + '</div>' +
    instructions +
  '</header>' + (teacher ? '' : studentIdentification(header));
}

function answerKeyCell(item) {
  if (!item) return '<td class="key-empty" colspan="3"></td>';
  return '<td>' + item.number + '</td><td class="answer-key-answer">' + escapeHtml(item.answer) + '</td><td class="answer-key-points">' + formatPoints(item.points) + '</td>';
}

function answerKeyHtml(variant) {
  const items = buildAnswerKey(variant).map((item, index) => ({ ...item, points: variant.questions[index]?.points ?? 1 }));
  const rows = [];
  for (let index = 0; index < items.length; index += 2) rows.push('<tr>' + answerKeyCell(items[index]) + answerKeyCell(items[index + 1]) + '</tr>');
  const total = variant.questions.reduce((sum, question) => sum + Number(question.points ?? 1), 0);
  return '<section class="answer-key page-break"><div class="section-kicker">Uso do professor</div><h2 class="section-title">Gabarito — Variante ' + variant.label + '</h2><p class="section-lead">Tabela de conferência da versão exportada. As respostas correspondem à ordem real das alternativas.</p>' +
    '<table class="answer-key-table"><thead><tr><th>Questão</th><th>Resposta</th><th>Pontos</th><th>Questão</th><th>Resposta</th><th>Pontos</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
    '<div class="answer-key-total"><span>Total de questões: ' + items.length + '</span><span>Total de pontos: ' + formatPoints(total) + '</span></div></section>';
}

export function renderHtmlDocument(header, variant, teacher, includeAnswerSheet) {
  const questions = variant.questions.map((question, index) => questionHtml(question, index + 1, teacher)).join('');
  const key = teacher ? answerKeyHtml(variant) : '';
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + escapeHtml(header.title || 'Avaliação') + ' — Variante ' + escapeHtml(variant.label) + '</title><style>' + PRINT_CSS + '</style></head><body><main class="exam-page">' + headerHtml(header, variant, teacher) + questions + (includeAnswerSheet ? answerSheet(header, variant) : '') + key + '</main></body></html>';
}

export function renderMarkdownDocument(header, variant, teacher, includeAnswerSheet) {
  const lines = [`# ${header.title || 'Avaliação'}`, `**Variante ${variant.label}**`, ''];
  if (header.institution) lines.push(`**Instituição:** ${header.institution}`);
  if (header.subject) lines.push(`**Disciplina:** ${header.subject}`);
  if (header.teacher) lines.push(`**Professor:** ${header.teacher}`);
  if (header.instructions) lines.push('', header.instructions);
  lines.push('');
  variant.questions.forEach((question, index) => {
    lines.push(`## ${index + 1}. ${formatQuestionOriginHeading(question)}`, '', question.context ?? '');
    getUniqueQuestionFiles(question).forEach((url, imageIndex) => lines.push('', `![Imagem de apoio ${imageIndex + 1}](${url})`));
    if (question.alternativesIntroduction) lines.push('', question.alternativesIntroduction);
    question.alternatives.forEach((alternative) => {
      const marker = teacher && alternative.isCorrect ? ' ✅' : '';
      lines.push('', `- **${alternative.letter})**${marker} ${alternative.text ?? ''}`);
      if (alternative.file) lines.push(`  ![Imagem da alternativa ${alternative.letter}](${alternative.file})`);
    });
    lines.push('');
  });
  if (includeAnswerSheet) lines.push('---', '', `## Folha de respostas — Variante ${variant.label}`, '', variant.questions.map((_, index) => `${index + 1}. ( A ) ( B ) ( C ) ( D ) ( E )`).join('\n'));
  if (teacher) {
    lines.push('', '---', '', `## Gabarito — Variante ${variant.label}`, '', '| Questão | Resposta | Pontos |', '| ---: | :---: | ---: |');
    buildAnswerKey(variant).forEach((item, index) => lines.push(`| ${item.number} | ${item.answer} | ${formatPoints(variant.questions[index]?.points ?? 1)} |`));
  }
  return lines.join('\n');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportVariants(header, variants, options = {}) {
  const files = {};
  for (const variant of variants) {
    const prefix = `prova-variante-${variant.label}`;
    files[`${prefix}-aluno.html`] = renderHtmlDocument(header, variant, false, options.includeAnswerSheet);
    files[`${prefix}-professor.html`] = renderHtmlDocument(header, variant, true, false);
    files[`${prefix}-aluno.md`] = renderMarkdownDocument(header, variant, false, options.includeAnswerSheet);
    files[`${prefix}-professor.md`] = renderMarkdownDocument(header, variant, true, false);
  }
  if (options.zip) {
    const zip = new JSZip();
    Object.entries(files).forEach(([name, content]) => zip.file(name, content));
    download(await zip.generateAsync({ type: 'blob' }), 'provas-enem.zip');
  } else {
    Object.entries(files).forEach(([name, content]) => download(new Blob([content], { type: name.endsWith('.html') ? 'text/html' : 'text/markdown' }), name));
  }
  return files;
}
