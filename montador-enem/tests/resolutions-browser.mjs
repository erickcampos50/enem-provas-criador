import assert from 'node:assert/strict';
import { mkdir, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const baseUrl = process.env.MONTADOR_TEST_URL || 'http://127.0.0.1:4173/enem-provas-criador/';
const database = new DatabaseSync(new URL('../../enem.sqlite', import.meta.url), { readOnly: true });
const clinical = database.prepare('SELECT id FROM questions WHERE year=2025 AND number=165').get();
const imageQuestion = database.prepare('SELECT id FROM questions WHERE year=2024 AND number=94').get();
const links = database.prepare(`SELECT q.id, q.year, q.language, r.body, r.source_number AS sourceNumber
  FROM questions q JOIN question_resolutions r ON r.question_id=q.id`).all();
database.close();
assert.equal(links.length, 370);

await mkdir('/tmp/opencode/poliedro-resolutions', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const resolutionImageRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.url().includes('azstgpoliedroresolveprd.blob.core.windows.net')) resolutionImageRequests.push(request.url());
});

async function openSearch(query, year) {
  const url = new URL(baseUrl);
  url.searchParams.set('q', query);
  url.searchParams.set('ano', year);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.locator('#db-status.bg-success').waitFor({ timeout: 30_000 });
  await page.locator('[data-preview-id]').first().waitFor();
}

async function closeModal() {
  await page.locator('#question-modal .btn-close').click();
  await page.locator('#question-modal').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => !document.body.classList.contains('modal-open'));
}

try {
  await openSearch('estudo clínico', '2025');
  await page.locator(`#search-results [data-preview-id="${clinical.id}"]`).click();
  await page.locator('#question-modal.show').waitFor();
  const button = page.locator('#btn-modal-resolution');
  assert.equal(await button.innerText(), 'Exibir resolução');
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.question-resolution').count(), 0);
  assert.equal(resolutionImageRequests.length, 0);
  await page.locator('#btn-modal-answer').click();
  assert.equal(await page.locator('#question-modal .alternative.correct').count(), 1);
  assert.equal(await page.locator('.question-resolution').count(), 0);
  await button.click();
  assert.equal(await button.innerText(), 'Ocultar resolução');
  assert.equal(await button.getAttribute('aria-expanded'), 'true');
  assert.match(await page.locator('.resolution-body').innerText(), /grupo 4/);
  assert.equal(await page.locator('#question-modal .alternative.correct').count(), 1);
  const expected = links.find((item) => item.id === clinical.id);
  assert.equal(await page.locator('#question-resolution-title').innerText(), 'Resolução');
  assert.equal(await page.locator('.question-resolution a').count(), 0);
  assert.doesNotMatch(await page.locator('.question-resolution').innerText(), /Poliedro|Fonte:|caderno amarelo/);
  await page.locator('#btn-modal-answer').click();
  assert.equal(await page.locator('#question-modal .alternative.correct').count(), 0);
  assert.equal(await page.locator('.question-resolution').count(), 1);
  await button.click();
  assert.equal(await page.locator('.question-resolution').count(), 0);
  await button.click();
  await page.locator('#btn-modal-add').click();
  await page.locator('#btn-modal-add').filter({ hasText: 'Remover' }).waitFor();
  await page.frameLocator('#exam-preview-frame').locator('.exam-question').waitFor();
  const proofHtml = await page.frameLocator('#exam-preview-frame').locator('body').innerHTML();
  assert.doesNotMatch(proofHtml, /question-resolution|Resolução — Poliedro/);
  assert.ok(!proofHtml.includes(expected.body));
  await closeModal();
  assert.equal(await page.locator('.question-resolution').count(), 0);
  await page.locator(`#search-results [data-preview-id="${clinical.id}"]`).click();
  await page.locator('#question-modal.show').waitFor();
  assert.equal(await button.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.question-resolution').count(), 0);
  await closeModal();

  await openSearch('nimesulida', '2024');
  await page.locator(`[data-preview-id="${imageQuestion.id}"]`).click();
  await page.locator('#question-modal.show').waitFor();
  assert.equal(resolutionImageRequests.length, 0, 'Nenhuma imagem da resolução deve carregar antes do clique');
  await button.click();
  assert.ok(await page.locator('.resolution-body img').count() > 0);
  await page.locator('.resolution-body img').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.resolution-body img')?.complete);
  await page.screenshot({ path: '/tmp/opencode/poliedro-resolutions/modal-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '/tmp/opencode/poliedro-resolutions/modal-mobile.png' });
  assert.equal(await page.locator('#question-modal .modal-body').evaluate((element) => element.scrollWidth > element.clientWidth), false);
  await closeModal();

  await openSearch('fotossíntese', '2023');
  await page.locator('[data-preview-id]').first().click();
  await page.locator('#question-modal.show').waitFor();
  assert.equal(await button.isDisabled(), true);
  assert.equal(await button.innerText(), 'Resolução indisponível');
  assert.equal(await page.locator('.question-resolution').count(), 0);

  // Exercise the built WASM worker, not just Node's SQLite implementation.
  const assets = await readdir(new URL('../../docs/assets/', import.meta.url));
  const workerFile = assets.find((file) => /^db-worker-.*\.js$/.test(file));
  const actual = await page.evaluate(async ({ workerUrl, dbUrl, ids }) => {
    const worker = new Worker(workerUrl, { type: 'module' });
    let nextId = 0;
    const pending = new Map();
    worker.onmessage = ({ data }) => {
      const request = pending.get(data.id);
      pending.delete(data.id);
      if (data.ok) request.resolve(data.result);
      else request.reject(new Error(data.error.message));
    };
    function request(type, payload) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, type, payload });
      });
    }
    try {
      const buffer = await (await fetch(dbUrl)).arrayBuffer();
      const init = await request('init', { buffer });
      const resolutions = [];
      for (const id of ids) {
        const question = await request('getQuestion', { id });
        resolutions.push({ id: question.id, year: question.year, language: question.language,
          body: question.resolution.body, sourceNumber: question.resolution.sourceNumber });
      }
      return { features: init.features, resolutions };
    } finally { worker.terminate(); }
  }, { workerUrl: new URL(`assets/${workerFile}`, baseUrl).href,
    dbUrl: new URL('enem.sqlite', baseUrl).href, ids: links.map((item) => item.id) });
  assert.equal(actual.features.resolutions, true);
  assert.deepEqual(actual.resolutions, links.map((item) => ({ ...item })));
  assert.deepEqual(errors, []);
  console.log('OK: 370 resoluções no worker; botão, gabarito independente, imagens sob demanda, reset, ausência em prova e layout móvel.');
} finally { await browser.close(); }
