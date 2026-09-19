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

await page.addInitScript(() => {
  if (!sessionStorage.getItem('__montador_smoke_initialized')) {
    localStorage.clear();
    sessionStorage.setItem('__montador_smoke_initialized', '1');
  }
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#db-status.bg-success').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('#db-status').innerText(), /^2\.757 questões · 15 provas$/);
  assert.match(await page.locator('h1').first().innerText(), /Provas ENEM para Professores/);
  assert.equal(await page.locator('#welcome-notice').count(), 1);
  await page.locator('#welcome-notice summary').click();
  assert.equal(await page.locator('#welcome-notice').getAttribute('open'), '');
  await page.locator('#btn-dismiss-welcome').click();
  assert.equal(await page.locator('#welcome-notice').evaluate((element) => element.classList.contains('d-none')), true);
  assert.equal(await page.evaluate(() => localStorage.getItem('montador-enem:welcome-dismissed:v1')), '1');
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
  const pageOneTitle = await page.locator(".result-title").first().innerText();
  const pageStart = await page.evaluate(() => performance.now());
  await page.locator("#pagination button").nth(1).click();
  await page.locator("#pagination span").filter({ hasText: "Página 2" }).waitFor({ state: "visible", timeout: 30_000 });
  const pageElapsed = await page.evaluate((started) => performance.now() - started, pageStart);
  assert.ok(pageElapsed < 2_000, "A paginação excedeu 2 segundos: " + pageElapsed + "ms");
  const pageTwoTitle = await page.locator(".result-title").first().innerText();
  assert.notEqual(pageTwoTitle, pageOneTitle);
  await page.locator("#pagination button").first().click();
  await page.locator("#pagination span").filter({ hasText: "Página 1" }).waitFor({ state: "visible", timeout: 30_000 });
  assert.equal(await page.locator(".result-title").first().innerText(), pageOneTitle);

  await page.locator('#search-query').fill('fotossíntese');
  await page.locator('#search-form button[type="submit"]').click();
  await page.locator('.question-result').first().waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('#result-count').innerText(), /questão/);
  await page.locator('.toast.show').filter({ hasText: 'Busca concluída' }).waitFor({ state: 'visible', timeout: 5_000 });

  await page.locator('.question-select').first().check();
  await page.locator('#selected-count').filter({ hasText: '1' }).waitFor({ state: 'visible' });
  assert.equal(await page.locator('#selected-count').innerText(), '1');
  const selectedQuestionId = Number(await page.locator('.question-select:checked').first().getAttribute('data-question-id'));
  await page.locator('.toast.show').filter({ hasText: 'Questão adicionada' }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#draft-status').filter({ hasText: 'Salvo neste navegador' }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#db-status.bg-success').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('#selected-count').filter({ hasText: '1' }).waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await page.locator('#variants-help').innerText(), /ordem de alternativas/);
  assert.match(await page.locator('#shuffle-help').innerText(), /alternativas erradas/);
  assert.match(await page.locator('#answer-sheet-help').innerText(), /folha compacta/);
  const pointsInput = page.locator('#selected-list .selected-points').first();
  assert.equal(await pointsInput.getAttribute('type'), 'text');
  assert.equal(await pointsInput.getAttribute('inputmode'), 'decimal');
  await pointsInput.fill('2,5');
  await pointsInput.blur();
  await page.locator('#total-points').filter({ hasText: '2.5' }).waitFor({ state: 'visible' });
  await page.locator('#btn-calculate-value').click();
  assert.equal(await page.locator('#header-totalValue').inputValue(), '2,5');
  await page.locator('.toast.show').filter({ hasText: 'Valor da prova calculado' }).waitFor({ state: 'visible', timeout: 5_000 });
  assert.match(await page.locator('#btn-print-student').innerText(), /Baixar prova em PDF/);
  assert.match(await page.locator('#btn-print-teacher').innerText(), /gabarito do professor/);
  assert.equal(await page.locator('#btn-export-files').count(), 0);
  assert.match(await page.locator('#btn-export-zip').innerText(), /Baixar versão ZIP/);
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

  await page.locator('#btn-save-share').click();
  await page.locator('#proof-storage-modal.show').waitFor({ state: 'visible' });
  assert.doesNotMatch(await page.locator('#proof-storage-modal').innerText(), /backup/i);
  await page.locator('#btn-create-link').click();
  const sharedLink = await page.locator('#proof-link').inputValue();
  assert.match(sharedLink, /#prova=/);
  const proofDownloadPromise = page.waitForEvent('download');
  await page.locator('#btn-download-proof').click();
  const proofDownload = await proofDownloadPromise;
  assert.equal(proofDownload.suggestedFilename(), 'prova-enem.json');
  await page.locator('#btn-open-proof').click();
  const selectedId = selectedQuestionId;
  await page.locator('#proof-file').setInputFiles({ name: 'prova-enem.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'montador-enem-proof', version: 1, header: {}, selected: [{ id: selectedId, points: 1 }], variantsCount: 1, shuffleIncorrect: false, includeAnswerSheet: true })) });
  await page.locator('#proof-storage-modal').waitFor({ state: 'hidden' });

  const printPopupPromise = page.waitForEvent('popup');
  await page.locator('#btn-print-student').click();
  const printPopup = await printPopupPromise;
  await printPopup.waitForLoadState('domcontentloaded');
  assert.match(await printPopup.title(), /Avaliação|Variante/);
  assert.equal(await printPopup.locator('.exam-header').count(), 1);
  assert.equal(await printPopup.locator('.question-label').count(), 0);
  const questionSource = await printPopup.locator('.question-source').first().innerText();
  assert.match(questionSource, /^\(.+\)$/);
  assert.doesNotMatch(questionSource, /^\(Questão\b/i);
  const questionSourceStyle = await printPopup.locator('.question-source').first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { fontStyle: style.fontStyle, fontSize: Number.parseFloat(style.fontSize), color: style.color };
  });
  assert.equal(questionSourceStyle.fontStyle, 'italic');
  assert.ok(questionSourceStyle.fontSize < 13);
  assert.equal(await printPopup.locator('.answer-sheet-table').count(), 1);
  assert.equal(await printPopup.locator('.exam-instructions').count(), 0);
  assert.doesNotMatch(await printPopup.locator('body').innerText(), /Leia atentamente|Marque apenas|Recorte ou arquive|Guarde esta folha/);
  assert.equal(await printPopup.locator('.answer-student-identification').count(), 1);
  assert.equal(await printPopup.locator('.page-footer').count(), 0);
  await printPopup.close();

  const sharedPage = await browser.newPage();
  await sharedPage.goto(sharedLink, { waitUntil: 'networkidle' });
  await sharedPage.locator('#db-status.bg-success').waitFor({ state: 'visible', timeout: 30_000 });
  await sharedPage.locator('#shared-proof-modal.show').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await sharedPage.locator('#shared-proof-message').innerText(), /1 questão/);
  await sharedPage.locator('#btn-open-shared-proof').click();
  await sharedPage.locator('#shared-proof-modal').waitFor({ state: 'hidden' });
  assert.equal(await sharedPage.locator('#selected-count').innerText(), '1');
  await sharedPage.close();

  const mismatchedUrl = new URL(sharedLink);
  const encodedPayload = mismatchedUrl.hash.slice('#prova='.length);
  const mismatchedPayload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  mismatchedPayload.databaseHash = 'outro-banco';
  mismatchedUrl.hash = 'prova=' + Buffer.from(JSON.stringify(mismatchedPayload)).toString('base64url');
  const mismatchPage = await browser.newPage();
  await mismatchPage.goto(mismatchedUrl.href, { waitUntil: 'networkidle' });
  await mismatchPage.locator('#db-status.bg-success').waitFor({ state: 'visible', timeout: 30_000 });
  await mismatchPage.locator('#shared-proof-modal.show').waitFor({ state: 'visible', timeout: 30_000 });
  assert.match(await mismatchPage.locator('#shared-proof-warning').innerText(), /outra versão/);
  await mismatchPage.close();

  const teacherPopupPromise = page.waitForEvent('popup');
  await page.locator('#btn-print-teacher').click();
  const teacherPopup = await teacherPopupPromise;
  await teacherPopup.waitForLoadState('domcontentloaded');
  assert.equal(await teacherPopup.locator('.answer-key-table').count(), 1);
  assert.equal(await teacherPopup.locator('.answer-key-total').count(), 1);
  assert.equal(await teacherPopup.locator('.page-footer').count(), 0);
  await teacherPopup.close();
} finally {
  await browser.close();
}

if (errors.length > 0) {
  throw new Error(`Erros no navegador: ${errors.map((error) => error.message).join('; ')}`);
}

console.log(`browser smoke ok: ${baseUrl}`);
