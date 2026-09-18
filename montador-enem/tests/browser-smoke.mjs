import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseUrl = process.env.MONTADOR_TEST_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on('pageerror', (error) => errors.push(error));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(new Error(message.text()));
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#db-status.bg-success').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('#db-status').innerText(), /Banco/);
  await page.locator(".question-result").first().waitFor({ state: "visible", timeout: 30_000 });
  const initialSnippets = await page.locator(".result-snippet").allInnerTexts();
  assert.ok(initialSnippets.length > 0);
  assert.ok(initialSnippets.every((snippet) => !snippet.includes("Sem trecho textual disponível.")));
  const previewMetrics = await page.locator(".result-snippet").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { minHeight: Number.parseFloat(style.minHeight), lineHeight: Number.parseFloat(style.lineHeight), lineClamp: style.webkitLineClamp };
  });
  assert.ok(previewMetrics.minHeight >= previewMetrics.lineHeight * 2.9);
  assert.equal(previewMetrics.lineClamp, "3");

  await page.locator('#search-query').fill('fotossíntese');
  await page.locator('#search-form button[type="submit"]').click();
  await page.locator('.question-result').first().waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('#result-count').innerText(), /questão/);

  await page.locator('.question-select').first().check();
  await page.locator('#selected-count').filter({ hasText: '1' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('#selected-count').innerText(), '1');

  await page.locator('#exam-preview-frame').waitFor({ state: 'visible', timeout: 30_000 });
  await page.frameLocator('#exam-preview-frame').locator('.exam-header').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('#preview-status').innerText(), /Variante A/);
  await page.locator('#preview-teacher').click();
  await page.frameLocator('#exam-preview-frame').locator('.answer-key-table').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#preview-student').click();
  await page.locator('#variants-count').selectOption('2');
  await page.locator('#preview-variant').selectOption('1');
  assert.equal(await page.frameLocator('#exam-preview-frame').locator('.exam-variant-value').innerText(), 'B');
  const previewPdfPopupPromise = page.waitForEvent('popup');
  await page.locator('#btn-preview-pdf').click();
  const previewPdfPopup = await previewPdfPopupPromise;
  await previewPdfPopup.waitForLoadState('domcontentloaded');
  assert.equal(await previewPdfPopup.locator('.exam-variant-value').innerText(), 'B');
  await previewPdfPopup.close();
  await page.locator('#preview-variant').selectOption('0');

  await page.locator('[data-preview-id]').first().click();
  await page.locator('#question-modal.show').waitFor({ state: 'visible' });
  assert.notEqual((await page.locator('#question-modal .modal-body').innerText()).trim(), '');
  assert.equal(await page.locator('#question-modal .alternative').first().evaluate((element) => getComputedStyle(element).alignItems), 'flex-start');
  await page.locator('#question-modal .btn-close').click();

  await page.locator('#search-query').fill('');
  await page.locator('#filter-images').check();
  await page.locator('#search-form button[type="submit"]').click();
  await page.locator('.question-result').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.result-title').first().click();
  await page.locator('#question-modal.show').waitFor({ state: 'visible' });
  const imageSources = await page.locator('#question-modal img').evaluateAll((images) => images.map((image) => image.getAttribute('src')));
  assert.equal(new Set(imageSources).size, imageSources.length);
  await page.locator('#question-modal .btn-close').click();

  await page.locator('#variants-count').selectOption('2');
  const zipDownloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-zip').click();
  const zipDownload = await zipDownloadPromise;
  assert.equal(zipDownload.suggestedFilename(), 'provas-enem.zip');

  const backupDownloadPromise = page.waitForEvent('download');
  await page.locator('#btn-export-backup').click();
  const backupDownload = await backupDownloadPromise;
  assert.equal(backupDownload.suggestedFilename(), 'prova-enem-backup.json');

  const printPopupPromise = page.waitForEvent('popup');
  await page.locator('#btn-print-student').click();
  const printPopup = await printPopupPromise;
  await printPopup.waitForLoadState('domcontentloaded');
  assert.match(await printPopup.title(), /Avaliação|Variante/);
  assert.equal(await printPopup.locator('.exam-header').count(), 1);
  assert.equal(await printPopup.locator('.answer-sheet-table').count(), 1);
  assert.equal(await printPopup.locator('.answer-student-identification').count(), 1);
  assert.equal(await printPopup.locator('.page-footer').count(), 1);
  assert.match(await printPopup.locator('.page-total').innerText(), /^\d+$/);
  await printPopup.close();

  const teacherPopupPromise = page.waitForEvent('popup');
  await page.locator('#btn-print-teacher').click();
  const teacherPopup = await teacherPopupPromise;
  await teacherPopup.waitForLoadState('domcontentloaded');
  assert.equal(await teacherPopup.locator('.answer-key-table').count(), 1);
  assert.equal(await teacherPopup.locator('.answer-key-total').count(), 1);
  assert.equal(await teacherPopup.locator('.page-footer').count(), 1);
  assert.match(await teacherPopup.locator('.page-total').innerText(), /^\d+$/);
  await teacherPopup.close();
} finally {
  await browser.close();
}

if (errors.length > 0) {
  throw new Error(`Erros no navegador: ${errors.map((error) => error.message).join('; ')}`);
}

console.log(`browser smoke ok: ${baseUrl}`);
