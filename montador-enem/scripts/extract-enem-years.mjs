#!/usr/bin/env node

/**
 * Orchestrate official-PDF extraction for new ENEM years.
 * Downloads canonical Azul books + answer keys (when missing) and runs
 * scripts/extract_enem_pdf.py via `uv run --with pymupdf`.
 */

import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');
const DEFAULT_PDF_DIR = resolve(projectRoot, '.cache', 'enem-pdf');
const DEFAULT_EXTRACT_ROOT = resolve(projectRoot, '.cache', 'enem-extract');
const INEP_BASE = 'https://download.inep.gov.br/enem/provas_e_gabaritos';

const CANONICAL_BOOKS = {
  day1: { suffix: 'D1_CD1', label: 'Azul 1º dia' },
  day2: { suffix: 'D2_CD7', label: 'Azul 2º dia' },
};

class ExtractError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ExtractError';
  }
}

function usage() {
  return `Uso: node scripts/extract-enem-years.mjs [opções]

Opções:
  --years LISTA       Anos (padrão: 2024,2025)
  --pdf-dir DIR       Cache dos PDFs (padrão: ${DEFAULT_PDF_DIR})
  --extract-root DIR  Saída JSON+media (padrão: ${DEFAULT_EXTRACT_ROOT})
  --skip-download     Usa apenas PDFs já presentes
  --verbose           Loga progresso
  --help              Esta ajuda
`;
}

function parseArgs(argv) {
  const options = {
    years: [2024, 2025],
    pdfDir: DEFAULT_PDF_DIR,
    extractRoot: DEFAULT_EXTRACT_ROOT,
    skipDownload: false,
    verbose: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--skip-download') options.skipDownload = true;
    else if (arg === '--verbose') options.verbose = true;
    else {
      const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
      const value = inline ?? argv[++index];
      if (!value) throw new ExtractError(`${flag} exige um valor.`);
      if (flag === '--years') {
        options.years = value.split(',').map((p) => Number(p.trim())).filter(Boolean);
      } else if (flag === '--pdf-dir') options.pdfDir = resolve(process.cwd(), value);
      else if (flag === '--extract-root') options.extractRoot = resolve(process.cwd(), value);
      else throw new ExtractError(`Opção desconhecida: ${flag}`);
    }
  }
  return options;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function run(command, args, { cwd = process.cwd() } = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) rejectPromise(new ExtractError(`${command} ${args.join(' ')} saiu com ${code}`));
      else resolvePromise();
    });
  });
}

async function download(url, dest, verbose) {
  if (verbose) console.error('[extract-years] GET', url);
  await run('curl', ['-k', '-L', '--fail', '--retry', '3', '--max-time', '180', '-o', dest, url]);
}

async function ensurePdfs(year, pdfDir, skipDownload, verbose) {
  const names = {
    day1: `${year}_PV_impresso_${CANONICAL_BOOKS.day1.suffix}`,
    day2: `${year}_PV_impresso_${CANONICAL_BOOKS.day2.suffix}`,
    gabarito1: `${year}_GB_impresso_${CANONICAL_BOOKS.day1.suffix}`,
    gabarito2: `${year}_GB_impresso_${CANONICAL_BOOKS.day2.suffix}`,
  };
  const paths = {};
  for (const [key, name] of Object.entries(names)) {
    const dest = join(pdfDir, `${name}.pdf`);
    paths[key] = dest;
    if (await exists(dest)) continue;
    if (skipDownload) throw new ExtractError(`PDF ausente: ${dest}`);
    await download(`${INEP_BASE}/${name}.pdf`, dest, verbose);
  }
  return paths;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  for (const year of options.years) {
    const pdfs = await ensurePdfs(year, options.pdfDir, options.skipDownload, options.verbose);
    const outDir = join(options.extractRoot, String(year));
    console.error(`[extract-years] extraindo ${year} → ${outDir}`);
    await run(
      'uv',
      [
        'run',
        '--with',
        'pymupdf',
        'python',
        join(here, 'extract_enem_pdf.py'),
        '--year',
        String(year),
        '--day1',
        pdfs.day1,
        '--day2',
        pdfs.day2,
        '--gabarito1',
        pdfs.gabarito1,
        '--gabarito2',
        pdfs.gabarito2,
        '--out',
        outDir,
      ],
      { cwd: projectRoot },
    );
  }

  console.log(`Extração concluída para ${options.years.join(', ')} em ${options.extractRoot}`);
  console.log('Importe com: npm run import:years');
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  main().catch((error) => {
    console.error(`[extract-years] ${error.message}`);
    process.exitCode = 1;
  });
}
