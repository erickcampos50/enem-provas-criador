#!/usr/bin/env node

/**
 * Baixa as resoluções das questões do ENEM publicadas no Poliedro Resolve
 * (2009 em diante) e grava tudo em um único CSV.
 *
 * Descoberta: o seletor de anos do site só lista 2017+, mas o sitemap contém
 * todas as provas desde 2009. O script lê o sitemap, agrupa por ano/dia e
 * escolhe UM caderno por dia (preferindo Amarelo).
 *
 * Extração: a seção "Gabarito" de uma página lista todas as questões da prova;
 * cada página de questão traz o enunciado e, quando publicado, a resolução.
 * Nos anos antigos o enunciado é uma imagem escaneada e não há resolução
 * textual — nesses casos a coluna `resolucao` fica vazia e `tem_resolucao`
 * indica "nao".
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');
const DEFAULT_OUT_DIR = resolve(projectRoot, 'data', 'poliedro');

const SITE = 'https://poliedroresolve.sistemapoliedro.com.br';
const SITEMAP = `${SITE}/sitemap.xml`;
const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const CORES = ['amarelo', 'amarela', 'azul', 'branco', 'branca', 'verde', 'cinza', 'rosa'];

class ResolucaoError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ResolucaoError';
  }
}

function usage() {
  return `Uso: node scripts/download-poliedro-resolucoes.mjs [opções]

Opções:
  --from ANO            Primeiro ano (padrão: 2009)
  --to ANO              Último ano (padrão: 2025)
  --dias LISTA          Dias a coletar, ex.: 1,2 (padrão: todos)
  --prova FILTRO        Só provas cujo slug contenha o filtro
  --out ARQUIVO         CSV de saída
                        (padrão: ${join(DEFAULT_OUT_DIR, 'resolucoes-enem-<from>-<to>.csv')})
  --somente-com-resolucao
                        Descarta questões sem resolução textual
  --concurrency N       Requisições simultâneas (padrão: 4)
  --verbose             Loga o progresso
  --help                Esta ajuda

Saída (uma linha por questão):
  ano, dia, caderno, data_prova, prova, ordem, tipo, numero, area, idioma,
  resposta, tem_resolucao, enunciado, resolucao, imagens, url
`;
}

function parseArgs(argv) {
  const options = {
    from: 2009,
    to: 2025,
    dias: null,
    prova: null,
    out: null,
    somenteComResolucao: false,
    concurrency: 4,
    verbose: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--somente-com-resolucao') options.somenteComResolucao = true;
    else if (arg === '--verbose') options.verbose = true;
    else {
      const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
      const value = inline ?? argv[++index];
      if (!value) throw new ResolucaoError(`${flag} exige um valor.`);
      if (flag === '--from') options.from = Number(value);
      else if (flag === '--to') options.to = Number(value);
      else if (flag === '--dias') {
        options.dias = value.split(',').map((part) => Number(part.trim()));
      } else if (flag === '--prova') options.prova = value;
      else if (flag === '--out') options.out = resolve(process.cwd(), value);
      else if (flag === '--concurrency') options.concurrency = Math.max(1, Number(value));
      else throw new ResolucaoError(`Opção desconhecida: ${flag}`);
    }
  }

  for (const [name, value] of [
    ['--from', options.from],
    ['--to', options.to],
  ]) {
    if (!Number.isInteger(value) || value < 1998) {
      throw new ResolucaoError(`${name} deve ser um ano válido.`);
    }
  }
  if (options.from > options.to) throw new ResolucaoError('--from não pode ser maior que --to.');
  if (options.dias && options.dias.some((dia) => ![1, 2].includes(dia))) {
    throw new ResolucaoError('--dias aceita apenas 1 e/ou 2.');
  }

  if (!options.out) {
    const range = options.from === options.to ? `${options.from}` : `${options.from}-${options.to}`;
    options.out = join(DEFAULT_OUT_DIR, `resolucoes-enem-${range}.csv`);
  }
  return options;
}

function log(verbose, ...args) {
  if (verbose) console.log(...args);
}

async function fetchText(url, { retries = 3, timeout = 30000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(timeout),
      });
      if (!response.ok) throw new ResolucaoError(`HTTP ${response.status} em ${url}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new ResolucaoError(`Falha ao baixar ${url}: ${lastError?.message ?? lastError}`);
}

/* ------------------------------------------------------------------------- */
/* Descoberta das provas                                                     */
/* ------------------------------------------------------------------------- */

async function discoverFromSitemap({ verbose } = {}) {
  const index = await fetchText(SITEMAP);
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((match) => match[1])
    .filter((url) => url.includes('vestibulares/sitemap'));

  const provas = new Map(); // ano -> Map(slug -> primeira URL de questão)

  for (const map of maps) {
    const url = map.startsWith('http') ? map : new URL(map, SITE).toString();
    const xml = await fetchText(url);
    for (const match of xml.matchAll(
      /<loc>([^<]*\/enem\/(\d{4})\/([^/<]+)\/[^<]*)<\/loc>/g,
    )) {
      const [, rawUrl, year, slug] = match;
      if (!provas.has(year)) provas.set(year, new Map());
      const yearMap = provas.get(year);
      if (!yearMap.has(slug)) {
        yearMap.set(slug, rawUrl.startsWith('http') ? rawUrl : new URL(rawUrl, SITE).toString());
      }
    }
  }

  log(verbose, `Sitemap: ${provas.size} anos de ENEM encontrados`);
  return provas;
}

function inferDay(slug) {
  if (/\bsabado\b/.test(slug)) return 1;
  if (/\bdomingo\b/.test(slug)) return 2;
  let match = slug.match(/dia-(\d)/);
  if (match) return Number(match[1]);
  match = slug.match(/(?:^|-)(\d)-dia/);
  if (match) return Number(match[1]);
  return '';
}

function inferCaderno(slug) {
  const cor = CORES.find((value) => slug.includes(value));
  if (!cor) return slug.includes('prova-119') ? 'único' : '';
  if (cor === 'amarela') return 'amarelo';
  if (cor === 'branca') return 'branco';
  return cor;
}

function inferDate(slug) {
  const match = slug.match(/(\d{2})-(\d{2})-(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

/** Um caderno por dia: prefere Amarelo e, na falta, o primeiro slug. */
function selectProvas(provasPorAno, options) {
  const selecionadas = [];

  for (const year of [...provasPorAno.keys()].map(Number).sort((a, b) => a - b)) {
    if (year < options.from || year > options.to) continue;
    let entries = [...provasPorAno.get(String(year)).entries()].map(([slug, seedUrl]) => ({
      year,
      slug,
      seedUrl,
      dia: inferDay(slug),
      caderno: inferCaderno(slug),
      dataProva: inferDate(slug),
    }));

    if (options.prova) {
      entries = entries.filter((entry) => entry.slug.includes(options.prova));
      if (!entries.length) continue;
    }

    const byDay = new Map();
    for (const entry of entries) {
      if (!byDay.has(entry.dia)) byDay.set(entry.dia, []);
      byDay.get(entry.dia).push(entry);
    }

    for (const dia of [...byDay.keys()].sort((a, b) => String(a).localeCompare(String(b)))) {
      if (options.dias && dia !== '' && !options.dias.includes(dia)) continue;
      const candidates = byDay.get(dia);
      const preferred =
        candidates.find((entry) => entry.caderno === 'amarelo') ??
        candidates.sort((a, b) => a.slug.localeCompare(b.slug, 'pt-BR'))[0];
      selecionadas.push(preferred);
    }
  }

  return selecionadas;
}

/* ------------------------------------------------------------------------- */
/* HTML → texto                                                              */
/* ------------------------------------------------------------------------- */

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  hellip: '…', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  bull: '•', middot: '·', deg: '°', plusmn: '±', times: '×', divide: '÷', frasl: '/',
  sup1: '¹', sup2: '²', sup3: '³', micro: 'µ', para: '¶', sect: '§',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', cent: '¢', yen: '¥',
  iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º',
  frac12: '½', frac14: '¼', frac34: '¾',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔',
  minus: '−', ne: '≠', le: '≤', ge: '≥', asymp: '≈', infin: '∞',
  sum: '∑', prod: '∏', radic: '√', int: '∫', there4: '∴', sim: '∼', cong: '≅', equiv: '≡',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ',
  omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ', Eta: 'Η',
  Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν', Xi: 'Ξ',
  Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ', Phi: 'Φ',
  Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
  aacute: 'á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  ccedil: 'ç',
  eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
  iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
  ntilde: 'ñ',
  oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
  yacute: 'ý', yuml: 'ÿ', szlig: 'ß',
  Aacute: 'Á', Agrave: 'À', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å', AElig: 'Æ',
  Ccedil: 'Ç',
  Eacute: 'É', Egrave: 'È', Ecirc: 'Ê', Euml: 'Ë',
  Iacute: 'Í', Igrave: 'Ì', Icirc: 'Î', Iuml: 'Ï',
  Ntilde: 'Ñ',
  Oacute: 'Ó', Ograve: 'Ò', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö', Oslash: 'Ø',
  Uacute: 'Ú', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  Yacute: 'Ý',
  acute: '´',
};

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, (whole, entity) => {
    if (entity[0] === '#') {
      const hex = entity[1] === 'x' || entity[1] === 'X';
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity] ?? whole;
  });
}

function stripTags(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------------- */
/* MathML → texto linear                                                     */
/* ------------------------------------------------------------------------- */

const MATH_OPERATORS = new Set([
  '=', '+', '−', '-', '×', '÷', '·', '±', '⇒', '⇔', '→', '←', '↔',
  '<', '>', '≤', '≥', '≠', '≈', '≡', '≅', '∼',
]);

function parseMarkup(xml) {
  const root = { type: 'root', children: [] };
  const stack = [root];
  const token = /<(\/?)([a-zA-Z][\w:.-]*)((?:\s+[^>]*?)?)(\/?)>|([^<]+)/g;
  let match;

  while ((match = token.exec(xml))) {
    if (match[5] !== undefined) {
      const value = decodeEntities(match[5]).replace(/\s+/g, ' ');
      if (value.trim()) stack[stack.length - 1].children.push({ type: 'text', value });
      continue;
    }

    const [, closing, rawName, , selfClosing] = match;
    const name = rawName.toLowerCase();
    if (closing) {
      if (stack.length > 1) stack.pop();
    } else {
      const node = { type: 'element', name, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root;
}

function mathChildren(node) {
  return node.children.map(renderMathNode).join('');
}

function wrapMath(value) {
  if (!value) return '';
  if (/^[^\s+\-−*/=<>^_]+$/.test(value)) return value;
  return `(${value})`;
}

function renderMathNode(node) {
  if (node.type === 'text') return node.value;

  const children = () => node.children.filter((child) => child.type === 'element');
  const text = () => mathChildren(node).trim();

  switch (node.name) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'semantics':
    case 'annotation-xml':
      return mathChildren(node);
    case 'mi':
    case 'mn':
    case 'mtext':
    case 'ms':
      return text();
    case 'mo': {
      const value = text();
      if (MATH_OPERATORS.has(value)) return ` ${value} `;
      if (value === ',') return ', ';
      return value;
    }
    case 'mspace':
      return ' ';
    case 'mfrac': {
      const [num, den] = children();
      return `${wrapMath(num ? renderMathNode(num) : '')}/${wrapMath(den ? renderMathNode(den) : '')}`;
    }
    case 'msup': {
      const [base, sup] = children();
      return `${wrapMath(base ? renderMathNode(base) : '')}^${wrapMath(sup ? renderMathNode(sup) : '')}`;
    }
    case 'msub': {
      const [base, sub] = children();
      return `${wrapMath(base ? renderMathNode(base) : '')}_${wrapMath(sub ? renderMathNode(sub) : '')}`;
    }
    case 'msubsup': {
      const [base, sub, sup] = children();
      return `${wrapMath(base ? renderMathNode(base) : '')}_${wrapMath(
        sub ? renderMathNode(sub) : '',
      )}^${wrapMath(sup ? renderMathNode(sup) : '')}`;
    }
    case 'msqrt':
      return `√(${mathChildren(node)})`;
    case 'mroot': {
      const [base, index] = children();
      return `root(${base ? renderMathNode(base) : ''}, ${index ? renderMathNode(index) : ''})`;
    }
    case 'mfenced':
      return `(${children().map(renderMathNode).join(', ')})`;
    case 'menclose':
    case 'mover':
    case 'munder':
    case 'munderover':
      return mathChildren(node);
    case 'mtable':
      return children()
        .map((row) => row.children.map(renderMathNode).join(' | '))
        .join('; ');
    case 'mtr':
    case 'mtd':
      return mathChildren(node);
    default:
      return mathChildren(node);
  }
}

function mathToText(block) {
  return renderMathNode(parseMarkup(block))
    .replace(/\s+/g, ' ')
    .replace(/(\d),\s+(?=\d)/g, '$1,')
    .trim();
}

function htmlToText(fragment) {
  if (!fragment) return '';
  let text = fragment
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<math\b[\s\S]*?<\/math>/gi, (block) => ` ${mathToText(block)} `)
    .replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, ' [imagem: $1] ')
    .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => `^${stripTags(inner)}`)
    .replace(/<sub\b[^>]*>([\s\S]*?)<\/sub>/gi, (_, inner) => `_${stripTags(inner)}`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(text)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractBalancedDiv(html, start) {
  const open = html.slice(start).match(/^<div\b[^>]*>/);
  if (!open) return '';
  let depth = 1;
  let index = start + open[0].length;
  const tag = /<div\b[^>]*>|<\/div>/g;
  tag.lastIndex = index;
  let match;
  while ((match = tag.exec(html))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return html.slice(start);
}

function uniqueImages(fragment) {
  return [...new Set([...fragment.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]))];
}

/* ------------------------------------------------------------------------- */
/* Coleta                                                                    */
/* ------------------------------------------------------------------------- */

function normalizeArea(rawArea, numero) {
  if (numero === 'RED') return { area: 'Redação', idioma: '' };
  if (numero === 'TXT') return { area: 'Texto', idioma: '' };
  if (/espanhol/i.test(rawArea)) return { area: 'Espanhol', idioma: 'Espanhol' };
  if (/ingl[eê]s/i.test(rawArea)) return { area: 'Inglês', idioma: 'Inglês' };
  if (/reda[cç][aã]o/i.test(rawArea) && !/l[ií]ngua/i.test(rawArea)) {
    return { area: 'Redação', idioma: '' };
  }
  return { area: 'Geral', idioma: '' };
}

/** Lê a seção "Gabarito" da página: números, áreas e respostas. */
function parseGabaritoSection(html, pageUrl) {
  const sectionStart = html.indexOf('<section id="exam-results"');
  if (sectionStart < 0) throw new ResolucaoError(`Seção de gabarito ausente em ${pageUrl}`);

  const sectionEnd = html.indexOf('</section>', sectionStart);
  const section = html.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : undefined);
  const headings = [...section.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)];
  const questoes = [];

  for (let index = 0; index < headings.length; index += 1) {
    const rawArea = stripTags(headings[index][1]);
    const start = headings[index].index + headings[index][0].length;
    const end = index + 1 < headings.length ? headings[index + 1].index : section.length;
    const block = section.slice(start, end);

    for (const anchor of block.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
      const spans = [...anchor[2].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map((m) =>
        stripTags(m[1]),
      );
      if (spans.length < 2) continue;

      const [rawNumero, rawResposta] = spans;
      const numero = /^\d+$/.test(rawNumero) ? Number(rawNumero) : rawNumero;
      const { area, idioma } = normalizeArea(rawArea, numero);
      const tipo = numero === 'RED' ? 'redacao' : numero === 'TXT' ? 'texto' : 'questao';
      questoes.push({
        numero,
        tipo,
        area,
        idioma,
        resposta: tipo === 'questao' ? rawResposta.toUpperCase() : '',
        url: new URL(anchor[1], pageUrl.replace(/#.*$/, '')).toString(),
      });
    }
  }

  if (!questoes.length) throw new ResolucaoError(`Nenhuma questão encontrada em ${pageUrl}`);
  return questoes;
}

/** Extrai enunciado e resolução da página de uma questão. */
function parseQuestionPage(html) {
  const start = html.indexOf('<section id="questao"');
  if (start < 0) throw new ResolucaoError('Seção da questão não encontrada.');
  const nextSection = html.indexOf('<section', start + 10);
  const section = html.slice(start, nextSection > start ? nextSection : undefined);

  const gabaritoIndex = section.indexOf('Gabarito<!-- -->:');
  const answerMatch = section.match(
    /Gabarito<!-- -->:<\/span><ul[^>]*>\s*<span[^>]*>([^<]+)<\/span>/,
  );
  const resposta = answerMatch ? stripTags(answerMatch[1]).toUpperCase() : '';

  // Corpo da questão: do primeiro bloco de conteúdo até o gabarito.
  let body = '';
  const opening = /<div\b[^>]*class="[^"]*max-w-none[^"]*"[^>]*>/g;
  const first = opening.exec(section);
  if (first && (gabaritoIndex < 0 || first.index < gabaritoIndex)) {
    body = section.slice(first.index, gabaritoIndex >= 0 ? gabaritoIndex : undefined);
  } else if (gabaritoIndex >= 0) {
    body = section.slice(0, gabaritoIndex);
  }

  const alternativesIndex = body.indexOf('Alternativas</h3>');
  if (alternativesIndex >= 0) body = body.slice(0, alternativesIndex);

  let resolucaoHtml = '';
  if (gabaritoIndex >= 0) {
    const resOpening = /<div\b[^>]*class="[^"]*\bck-content\b[^"]*"[^>]*>/g;
    resOpening.lastIndex = gabaritoIndex;
    const match = resOpening.exec(section);
    if (match) resolucaoHtml = extractBalancedDiv(section, match.index);
  }

  return {
    resposta,
    enunciado: htmlToText(body),
    resolucao: htmlToText(resolucaoHtml),
    imagens: uniqueImages(`${body}\n${resolucaoHtml}`),
  };
}

async function mapLimit(items, limit, worker, { verbose, label } = {}) {
  const results = new Array(items.length);
  let cursor = 0;
  let done = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
      done += 1;
      if (verbose && done % 25 === 0) log(true, `  ${label}: ${done}/${items.length}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

/* ------------------------------------------------------------------------- */
/* CSV                                                                       */
/* ------------------------------------------------------------------------- */

const COLUMNS = [
  'ano',
  'dia',
  'caderno',
  'data_prova',
  'prova',
  'ordem',
  'tipo',
  'numero',
  'area',
  'idioma',
  'resposta',
  'tem_resolucao',
  'enunciado',
  'resolucao',
  'imagens',
  'url',
];

function csvEscape(value) {
  const text = String(value ?? '').replace(/\r\n?/g, '\n');
  return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  const lines = [COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(COLUMNS.map((column) => csvEscape(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function dayForQuestion(prova, questao) {
  if (prova.dia !== '') return String(prova.dia);
  // 2009: caderno único com as duas aplicações (1–90 / 91–180).
  if (questao.numero === 'RED') return '1';
  if (typeof questao.numero === 'number') return questao.numero <= 90 ? '1' : '2';
  return '';
}

function buildRow(prova, questao, ordem) {
  return {
    ano: prova.year,
    dia: dayForQuestion(prova, questao),
    caderno: prova.caderno,
    data_prova: prova.dataProva,
    prova: prova.slug,
    ordem,
    tipo: questao.tipo,
    numero: questao.numero,
    area: questao.area,
    idioma: questao.idioma,
    resposta: questao.resposta,
    tem_resolucao: questao.resolucao ? 'sim' : 'nao',
    enunciado: questao.enunciado,
    resolucao: questao.resolucao,
    imagens: questao.imagens.join(' | '),
    url: questao.url,
  };
}

/* ------------------------------------------------------------------------- */
/* Main                                                                      */
/* ------------------------------------------------------------------------- */

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const provasPorAno = await discoverFromSitemap(options);
  const provas = selectProvas(provasPorAno, options);
  if (!provas.length) {
    throw new ResolucaoError('Nenhuma prova encontrada para os filtros informados.');
  }

  const rows = [];
  let falhas = 0;
  let semResolucao = 0;

  for (const prova of provas) {
    log(options.verbose, `\nColetando ${prova.year} · dia ${prova.dia || '?'} · ${prova.caderno}`);
    const seedHtml = await fetchText(prova.seedUrl);
    const questoes = parseGabaritoSection(seedHtml, prova.seedUrl);

    const detalhes = await mapLimit(
      questoes,
      options.concurrency,
      async (questao) => {
        try {
          const html = await fetchText(questao.url);
          const detalhesPagina = parseQuestionPage(html);
          if (detalhesPagina.resposta && detalhesPagina.resposta !== questao.resposta) {
            console.warn(
              `Gabarito divergente em ${questao.url}: lista=${questao.resposta}, página=${detalhesPagina.resposta}`,
            );
          }
          return { ...questao, ...detalhesPagina };
        } catch (error) {
          falhas += 1;
          console.warn(`Falha em ${questao.url}: ${error.message}`);
          return { ...questao, enunciado: '', resolucao: '', imagens: [] };
        }
      },
      { verbose: options.verbose, label: `${prova.year}/${prova.caderno}` },
    );

    const comResolucao = detalhes.filter((questao) => questao.resolucao).length;
    semResolucao += detalhes.length - comResolucao;
    console.log(
      `${prova.year} · dia ${prova.dia || '?'} · ${prova.caderno}: ` +
        `${detalhes.length} questões, ${comResolucao} com resolução`,
    );

    detalhes.forEach((questao, index) => {
      if (options.somenteComResolucao && !questao.resolucao) return;
      rows.push(buildRow(prova, questao, index + 1));
    });
  }

  await mkdir(dirname(options.out), { recursive: true });
  await writeFile(options.out, toCsv(rows), 'utf8');

  console.log(`\nCSV: ${options.out}`);
  console.log(`Linhas: ${rows.length}`);
  console.log(`Provas: ${provas.length}`);
  if (semResolucao) {
    console.log(
      `Questões sem resolução textual: ${semResolucao} ` +
        '(o site só publica resolução para 2024/2025; redações também não têm resolução).',
    );
  }
  if (falhas) console.warn(`Questões com falha de download: ${falhas}`);
}

main().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exitCode = 1;
});
