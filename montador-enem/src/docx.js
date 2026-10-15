import JSZip from 'jszip';
import { marked } from 'marked';
import { assetCandidates } from './assets.js';
import { buildAnswerKey } from './variants.js';
import { formatQuestionOriginHeading, getUniqueQuestionFiles } from './exports.js';

// Largura útil da página A4 com as margens usadas abaixo (twips).
const CONTENT_WIDTH_DXA = 11906 - 851 - 851;
const MAX_IMAGE_WIDTH_PX = 560;
const MAX_IMAGE_HEIGHT_PX = 640;
const EMU_PER_PX = 9525;

const IMAGE_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
};

function escapeXml(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extensionOf(url, contentType) {
  const fromType = String(contentType ?? '').split(';')[0].trim().toLowerCase();
  for (const [ext, type] of Object.entries(IMAGE_TYPES)) {
    if (type === fromType) return ext;
  }
  const path = String(url ?? '').split('?')[0].split('#')[0];
  const match = path.match(/\.([a-z0-9]+)$/i);
  const ext = (match?.[1] ?? '').toLowerCase();
  if (ext === 'jpeg') return 'jpg';
  return IMAGE_TYPES[ext] ? ext : '';
}

export function extractInlineImages(text) {
  const found = [];
  const seen = new Set();
  const push = (url, alt) => {
    const key = String(url ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    found.push({ url: key, alt: String(alt ?? '').trim() });
  };
  marked.walkTokens(marked.lexer(String(text ?? '')), token => {
    if (token.type === 'image') push(token.href, token.text);
  });
  for (const match of String(text ?? '').matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
    push(match[1], '');
  }
  return found;
}

function runsXml(runs, { size = null, color = null } = {}) {
  return runs.map((run) => {
    if (run.xml) return run.xml;
    const props = '<w:rPr>' +
      (run.bold ? '<w:b/><w:bCs/>' : '') +
      (run.italic ? '<w:i/>' : '') +
      (run.color ?? color ? '<w:color w:val="' + (run.color ?? color) + '"/>' : '') +
      (size ? '<w:sz w:val="' + size + '"/><w:szCs w:val="' + size + '"/>' : '') +
      (run.script ? '<w:vertAlign w:val="' + run.script + '"/>' : '') +
      '</w:rPr>';
    return '<w:r>' + props + (run.break ? '<w:br/>' : '<w:t xml:space="preserve">' + escapeXml(run.text) + '</w:t>') + '</w:r>';
  }).join('');
}

function paragraphXml(content, { bold = false, size = null, color = null, align = null, heading = null, spaceAfter = 120, keepNext = false, keepLines = false, pageBreak = false } = {}) {
  const runs = (typeof content === 'string' ? richRuns(content) : content).map(run => ({ ...run, bold: bold || run.bold }));
  let pPr = '<w:pPr>';
  if (heading) pPr += '<w:pStyle w:val="Heading' + heading + '"/>';
  if (heading || keepNext) pPr += '<w:keepNext/>';
  if (keepLines) pPr += '<w:keepLines/>';
  pPr += '<w:widowControl/>';
  if (pageBreak) pPr += '<w:pageBreakBefore/>';
  if (align) pPr += '<w:jc w:val="' + align + '"/>';
  pPr += '<w:spacing w:after="' + spaceAfter + '" w:line="276" w:lineRule="auto"/></w:pPr>';
  return '<w:p>' + pPr + runsXml(runs, { size, color }) + '</w:p>';
}

function spacerXml() {
  return '<w:p><w:pPr><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:noProof/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:r></w:p>';
}

function tableXml(rows, { widths, headerFill = '222222', headerColor = 'FFFFFF' } = {}) {
  const total = widths.reduce((sum, width) => sum + width, 0);
  const grid = widths.map((width) => '<w:gridCol w:w="' + width + '"/>').join('');
  const body = rows.map((cells, rowIndex) => {
    const tcs = cells.map((cell, cellIndex) => {
      const texts = Array.isArray(cell) ? cell : [cell];
      const isHeaderRow = headerFill && rowIndex === 0;
      const width = widths[Math.min(cellIndex, widths.length - 1)];
      const inner = texts.map((text) => paragraphXml(
        typeof text === 'string' || Array.isArray(text) ? text : text.text,
        { bold: Boolean(isHeaderRow || (typeof text === 'object' && text.bold)), size: 20, color: isHeaderRow ? headerColor : null, align: 'left', spaceAfter: 0 },
      )).join('');
      return '<w:tc><w:tcPr><w:tcW w:w="' + width + '" w:type="dxa"/>' +
        (isHeaderRow ? '<w:shd w:val="clear" w:fill="' + headerFill + '"/>' : '') +
        '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:start w:w="100" w:type="dxa"/><w:end w:w="100" w:type="dxa"/></w:tcMar>' +
        '</w:tcPr>' + inner + '</w:tc>';
    }).join('');
    return '<w:tr><w:trPr><w:cantSplit/>' + (rowIndex === 0 && headerFill ? '<w:tblHeader/>' : '') + '</w:trPr>' + tcs + '</w:tr>';
  }).join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="' + total + '" w:type="dxa"/>' +
    '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="999999"/><w:left w:val="single" w:sz="4" w:color="999999"/>' +
    '<w:bottom w:val="single" w:sz="4" w:color="999999"/><w:right w:val="single" w:sz="4" w:color="999999"/>' +
    '<w:insideH w:val="single" w:sz="4" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:color="999999"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
    '<w:tblGrid>' + grid + '</w:tblGrid>' + body + '</w:tbl>';
}

function formatPoints(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '1';
  return number.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function decodeEntities(text) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', times: '×', deg: '°', micro: 'µ', minus: '−' };
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, entity) => {
    if (entity[0] !== '#') {
      if (entities[entity]) return entities[entity];
      if (typeof document !== 'undefined') {
        const decoder = document.createElement('textarea');
        decoder.innerHTML = full;
        return decoder.value;
      }
      return full;
    }
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
}

function richRuns(text, style = {}, tokens) {
  const result = [];
  let active = { ...style };
  const visit = tokens => {
    for (const token of tokens) {
      if (token.type === 'strong' || token.type === 'em' || token.type === 'del') {
        const before = active;
        active = { ...active, ...(token.type === 'strong' ? { bold: true } : token.type === 'em' ? { italic: true } : {}) };
        visit(token.tokens ?? []);
        active = before;
      } else if (token.type === 'br') result.push({ break: true });
      else if (token.type === 'image') result.push({ image: token.href, alt: token.text });
      else if (token.type === 'html') {
        const html = token.text;
        if (/^<br\s*\/?\s*>/i.test(html)) result.push({ break: true });
        else if (/^<img\b/i.test(html)) {
          const image = extractInlineImages(html)[0];
          if (image) result.push({ image: image.url, alt: image.alt });
        } else if (/^<(sup|sub)\b/i.test(html)) active.script = /^<sup/i.test(html) ? 'superscript' : 'subscript';
        else if (/^<\/(sup|sub)>/i.test(html)) delete active.script;
        else if (/^<(b|strong)>/i.test(html)) active.bold = true;
        else if (/^<\/(b|strong)>/i.test(html)) active.bold = style.bold;
        else if (/^<(i|em)>/i.test(html)) active.italic = true;
        else if (/^<\/(i|em)>/i.test(html)) active.italic = style.italic;
      } else if (token.tokens) visit(token.tokens);
      else result.push({ ...active, text: decodeEntities(token.text ?? token.raw ?? '') });
    }
  };
  visit(tokens ?? marked.Lexer.lexInline(String(text ?? ''), { ...marked.defaults, breaks: true }));
  return result;
}

// Render blocks and inline images in their original reading order.
function contentXml(value, imageBlock, options = {}) {
  const renderInline = (text, extra = {}, tokens) => {
    let pending = [];
    let xml = '';
    const flush = () => {
      if (pending.length) xml += paragraphXml(pending, { ...options, keepNext: /^[A-E]\)\s*(?:\(Resposta correta\))?$/.test(text.trim()), ...extra });
      pending = [];
    };
    const runs = richRuns(text, {}, tokens);
    const hasText = runs.some(run => String(run.text ?? '').trim());
    for (const run of runs) {
      if (run.image && hasText) pending.push({ xml: imageBlock(run.image, run.alt || 'imagem', true) });
      else if (run.image) { flush(); xml += imageBlock(run.image, run.alt || 'imagem'); }
      else pending.push(run);
    }
    flush();
    return xml;
  };
  const render = tokens => tokens.map(token => {
    if (token.type === 'space' || token.type === 'hr') return '';
    if (token.type === 'list') return token.items.map((item, index) => renderInline((token.ordered ? (Number(token.start) + index) + '. ' : '• ') + item.text)).join('');
    if (token.type === 'blockquote') return render(token.tokens);
    if (token.type === 'table') {
      const rows = [token.header, ...token.rows].map(row => row.map(cell => ({ text: richRuns(cell.text) })));
      // Images inside table cells cannot be silently discarded.
      if (rows.some(row => row.some(cell => cell.text.some(run => run.image)))) throw new Error('Esta questão contém imagem dentro de tabela. Use o PDF para preservar o conteúdo.');
      const width = Math.floor(CONTENT_WIDTH_DXA / token.header.length);
      return tableXml(rows, { widths: token.header.map(() => width) }) + spacerXml();
    }
    if (token.type === 'html' && /<(table|svg|math)\b/i.test(token.text)) throw new Error('Esta questão contém conteúdo que ainda não é compatível com DOCX. Use o PDF para preservar o conteúdo.');
    if (token.type === 'heading') return renderInline(token.text, { bold: true });
    return renderInline(token.text ?? token.raw ?? '', {}, token.tokens);
  }).join('');
  const text = String(value ?? '').replace(/<\/?(?:p|div)\b[^>]*>/gi, '\n\n');
  return render(marked.lexer(text, { ...marked.defaults, gfm: true, breaks: true }));
}

function imageDrawingXml(part) {
  return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:noProof/></w:rPr><w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<wp:extent cx="' + part.cx + '" cy="' + part.cy + '"/>' +
    '<wp:docPr id="' + part.docId + '" name="' + escapeXml(part.alt || part.fileName) + '"/>' +
    '<wp:cNvGraphicFramePr/>' +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic><pic:nvPicPr><pic:cNvPr id="' + part.docId + '" name="' + escapeXml(part.fileName) + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="' + part.relId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + part.cx + '" cy="' + part.cy + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>' +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

// Ordem de exibição das imagens de uma questão: inline no enunciado,
// arquivos extras e imagens das alternativas.
export function collectImageUrls(question) {
  const ordered = [];
  const seen = new Set();
  const push = (url, alt) => {
    const key = String(url ?? '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    ordered.push({ url: key, alt: String(alt ?? '') });
  };
  for (const text of [question?.context, question?.alternativesIntroduction, ...(question?.alternatives ?? []).map((alt) => alt?.text)]) {
    for (const image of extractInlineImages(text)) push(image.url, image.alt);
  }
  for (const url of getUniqueQuestionFiles(question)) push(url, 'Imagem de apoio');
  for (const alternative of question?.alternatives ?? []) {
    const file = alternative?.file ?? alternative?.fileUrl;
    if (file) push(file, 'Imagem da alternativa ' + (alternative.letter ?? ''));
  }
  return ordered;
}

async function probeSize(bytes, contentType) {
    if (typeof createImageBitmap !== 'undefined') {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: contentType }));
      const size = { width: bitmap.width, height: bitmap.height };
      if (bitmap.close) bitmap.close();
      if (size.width > 0 && size.height > 0) return size;
    }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (contentType === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (contentType === 'image/gif' && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (contentType === 'image/jpeg' && view.getUint16(0) === 0xffd8) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      if (length < 2) break;
      offset += length + 2;
    }
  }
  throw new Error('Imagem inválida ou formato não suportado.');
}

export async function fetchImageParts(urls) {
  const parts = new Map();
  let counter = 0;
  for (const { url, alt } of urls) {
    if (parts.has(url)) continue;
    let part = null;
    for (const candidate of assetCandidates(url)) {
      try {
        const response = await fetch(candidate, { signal: AbortSignal.timeout(12000) });
        if (!response.ok) continue;
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('text/html')) continue;
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!bytes.length) continue;
        const ext = extensionOf(candidate, contentType);
        if (!ext) continue;
        const size = await probeSize(bytes, IMAGE_TYPES[ext]);
        if (!(size.width > 0 && size.height > 0)) continue;
        const scale = Math.min(1, MAX_IMAGE_WIDTH_PX / size.width, MAX_IMAGE_HEIGHT_PX / size.height);
        counter += 1;
        part = {
          url,
          alt,
          bytes,
          ext,
          contentType: IMAGE_TYPES[ext],
          fileName: 'image' + counter + '.' + ext,
          cx: Math.round(size.width * scale * EMU_PER_PX),
          cy: Math.round(size.height * scale * EMU_PER_PX),
          relId: 'rIdImage' + counter,
          docId: 1000 + counter,
        };
        break;
      } catch {
        // Tenta o próximo candidato de hospedagem.
      }
    }
    if (part) {
      parts.set(url, part);
    } else throw new Error('Não foi possível carregar uma imagem da prova. Confira sua conexão e tente novamente. Nenhum DOCX incompleto foi baixado.');
  }
  return parts;
}

export function buildDocumentXml(header, variant, teacher, includeAnswerSheet, images = new Map()) {
  const safeHeader = header ?? {};
  const questions = variant?.questions ?? [];
  const title = (safeHeader.title || 'Avaliação') + ' — Variante ' + (variant?.label ?? '');
  const parts = [];
  let drawingId = 0;
  const imageBlock = (url, alt, inline = false) => {
    const part = images.get(String(url ?? '').trim());
    if (!part) throw new Error('Uma imagem da prova não foi carregada. Tente gerar o DOCX novamente.');
    const xml = imageDrawingXml({ ...part, docId: ++drawingId });
    return inline ? xml.slice(xml.indexOf('<w:r>'), xml.lastIndexOf('</w:r>') + 6) : xml;
  };
  parts.push(paragraphXml(title, { heading: 1, align: 'center', spaceAfter: 60 }));
  parts.push(paragraphXml(
    'Variante ' + (variant?.label ?? '') + (teacher ? ' · Versão do professor' : ' · Versão do aluno'),
    { bold: true, align: 'center', size: 22, spaceAfter: 200 },
  ));
  if (safeHeader.institution) parts.push(paragraphXml(safeHeader.institution, { align: 'center', size: 22, spaceAfter: 200 }));

  const labelWidth = 2600;
  const valueWidth = CONTENT_WIDTH_DXA - labelWidth;
  const meta = [
    ['Disciplina', safeHeader.subject || '—'],
    ['Professor(a)', safeHeader.teacher || '—'],
    ['Turma', safeHeader.className || '—'],
    ['Data', safeHeader.date || '—'],
    ['Período', safeHeader.period || '—'],
    ['Duração', safeHeader.duration || '—'],
    ['Valor da prova', safeHeader.totalValue || '—'],
    ['Questões', questions.length + ' questão(ões)'],
  ];
  parts.push(tableXml([['Campo', 'Valor'], ...meta], { widths: [labelWidth, valueWidth] }));
  parts.push(spacerXml());

  if (safeHeader.instructions) {
    parts.push(paragraphXml('Orientações', { heading: 2 }));
    parts.push(contentXml(safeHeader.instructions, imageBlock));
  }

  if (!teacher) {
    parts.push(paragraphXml('Identificação do aluno', { heading: 2 }));
    parts.push(paragraphXml('Nome completo: ____________________________________________________'));
    parts.push(paragraphXml('Turma: ' + (safeHeader.className || '__________________') + '        Data: ' + (safeHeader.date || '__________________')));
  }

  questions.forEach((question, index) => {
    const number = String(index + 1).padStart(2, '0');
    const origin = formatQuestionOriginHeading(question);
    parts.push(paragraphXml('Questão ' + number + (origin ? ' — ' + origin : ''), { heading: 2 }));
    const points = Number(question.points ?? 1);
    parts.push(paragraphXml('Valor: ' + formatPoints(points) + (points === 1 ? ' ponto' : ' pontos'), { size: 20, keepNext: true }));
    parts.push(contentXml(question.context, imageBlock));
    for (const url of getUniqueQuestionFiles(question)) parts.push(imageBlock(url, 'imagem de apoio'));
    parts.push(contentXml(question.alternativesIntroduction, imageBlock));
    for (const alternative of question.alternatives ?? []) {
      const marker = teacher && alternative.isCorrect ? ' (Resposta correta)' : '';
      parts.push(contentXml((alternative.letter ?? '') + ') ' + (alternative.text || '') + marker, imageBlock, { bold: Boolean(teacher && alternative.isCorrect), keepLines: true }));
      const file = alternative.file ?? alternative.fileUrl;
      if (file && !extractInlineImages(alternative.text).some(image => image.url === file)) parts.push(imageBlock(file));
    }
  });

  if (includeAnswerSheet && !teacher) {
    parts.push(paragraphXml('Folha de respostas — Variante ' + (variant?.label ?? ''), { heading: 1, pageBreak: true }));
    parts.push(paragraphXml(safeHeader.title || 'Avaliação'));
    parts.push(paragraphXml('Nome: ____________________________________________________'));
    parts.push(paragraphXml('Turma: ' + (safeHeader.className || '__________________') + '        Data: ' + (safeHeader.date || '__________________')));
    const firstWidth = 1600;
    const optionWidth = Math.round((CONTENT_WIDTH_DXA - firstWidth) / 5);
    const rows = [[{ text: 'Questão', bold: true }, 'A', 'B', 'C', 'D', 'E']];
    questions.forEach((_, index) => rows.push([String(index + 1), '○', '○', '○', '○', '○']));
    parts.push(tableXml(rows, { widths: [firstWidth, optionWidth, optionWidth, optionWidth, optionWidth, optionWidth] }));
    parts.push(spacerXml());
  }

  if (teacher) {
    parts.push(paragraphXml('Gabarito — Variante ' + (variant?.label ?? ''), { heading: 1, pageBreak: true }));
    const key = buildAnswerKey(variant);
    const third = Math.round(CONTENT_WIDTH_DXA / 3);
    const rows = [[{ text: 'Questão', bold: true }, { text: 'Resposta', bold: true }, { text: 'Pontos', bold: true }]];
    key.forEach((item, index) => rows.push([String(item.number), String(item.answer), formatPoints(questions[index]?.points ?? 1)]));
    parts.push(tableXml(rows, { widths: [third, third, CONTENT_WIDTH_DXA - 2 * third] }));
    const total = questions.reduce((sum, question) => sum + Number(question.points ?? 1), 0);
    parts.push(spacerXml());
    parts.push(paragraphXml('Total de questões: ' + key.length + ' · Total de pontos: ' + formatPoints(total), { bold: true }));
  }

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + parts.join('') + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1021" w:right="851" w:bottom="851" w:left="851"/></w:sectPr></w:body></w:document>';
}

const BASE_CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  '[[IMAGE_DEFAULTS]]</Types>';

const BASE_RELS = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

function documentRels(imageList) {
  const imageRels = imageList.map((part) =>
    '<Relationship Id="' + part.relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/' + part.fileName + '"/>',
  ).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    imageRels + '</Relationships>';
}

const STYLES = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>' +
  '<w:rPr><w:noProof/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>' +
  '<w:rPr><w:noProof/><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>' +
  '<w:rPr><w:noProof/><w:b/><w:bCs/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>' +
  '</w:styles>';

function coreProps(title) {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<dc:title>' + escapeXml(title) + '</dc:title><dc:creator>montador-enem</dc:creator></cp:coreProperties>';
}

const APP_PROPS = '<?xml version="1.0" encoding="UTF-8"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>montador-enem</Application></Properties>';

function validateVariant(variant) {
  if (!variant?.questions?.length) throw new Error('Adicione pelo menos uma questão à prova.');
  for (const [index, question] of variant.questions.entries()) {
    const correct = (question.alternatives ?? []).filter(alt => alt.isCorrect);
    if (!Number.isFinite(Number(question.points ?? 1)) || Number(question.points ?? 1) < 0) throw new Error('Confira os pontos da questão ' + (index + 1) + '.');
    if (correct.length !== 1 || correct[0].letter !== question.correctAlternative) throw new Error('A questão ' + (index + 1) + ' está anulada ou sem gabarito confirmado. Remova-a da seleção para gerar o DOCX.');
    if (!(question.context || question.files?.length) || (question.alternatives ?? []).some(alt => !(alt.text || alt.file || alt.fileUrl))) throw new Error('A questão ' + (index + 1) + ' está incompleta. Revise a seleção antes de exportar.');
  }
}

export async function buildDocxBuffer(header, variant, teacher, includeAnswerSheet, preparedImages) {
  validateVariant(variant);
  const urls = [];
  urls.push(...extractInlineImages(header?.instructions));
  for (const question of variant?.questions ?? []) urls.push(...collectImageUrls(question));
  const images = preparedImages ?? await fetchImageParts(urls);
  const imageList = [...images.values()];
  const defaults = [...new Set(imageList.map((part) => part.ext))]
    .map((ext) => '<Default Extension="' + ext + '" ContentType="' + IMAGE_TYPES[ext] + '"/>')
    .join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', BASE_CONTENT_TYPES.replace('[[IMAGE_DEFAULTS]]', defaults));
  zip.file('_rels/.rels', BASE_RELS);
  zip.file('word/document.xml', buildDocumentXml(header, variant, teacher, includeAnswerSheet, images));
  zip.file('word/_rels/document.xml.rels', documentRels(imageList));
  zip.file('word/styles.xml', STYLES);
  zip.file('docProps/core.xml', coreProps((header?.title || 'Avaliação') + ' — Variante ' + (variant?.label ?? '')));
  zip.file('docProps/app.xml', APP_PROPS);
  for (const part of imageList) zip.file('word/media/' + part.fileName, part.bytes);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Botão exclusivo de teste: gera um .docx por versão (aluno/professor)
// e entrega tudo num ZIP para evitar múltiplos downloads bloqueados.
export async function exportVariantsDocx(header, variants, options = {}) {
  if (!variants?.length) throw new Error('Adicione pelo menos uma questão à prova.');
  variants.forEach(validateVariant);
  const urls = [...extractInlineImages(header?.instructions), ...variants.flatMap(variant => variant.questions.flatMap(collectImageUrls))];
  const images = await fetchImageParts(urls);
  const docxFiles = {};
  for (const variant of variants) {
    const prefix = 'prova-variante-' + variant.label;
    docxFiles[prefix + '-aluno.docx'] = await buildDocxBuffer(header, variant, false, options.includeAnswerSheet, images);
    docxFiles[prefix + '-professor.docx'] = await buildDocxBuffer(header, variant, true, false, images);
  }
  const zip = new JSZip();
  for (const [name, buffer] of Object.entries(docxFiles)) zip.file(name, buffer);
  const zipBuffer = await zip.generateAsync({ type: 'uint8array' });
  downloadBlob(new Blob([zipBuffer], { type: 'application/zip' }), 'provas-enem-docx.zip');
  return docxFiles;
}
