import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import JSZip from 'jszip';

const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.MONTADOR_TEST_URL || 'http://localhost:5173/');
  await page.locator('#db-status.bg-success').waitFor({ timeout: 30000 });
  const button = page.locator('#btn-export-docx');
  await button.click();
  await page.getByText('Adicione pelo menos uma questão à prova.', { exact: true }).waitFor();
  assert.equal(await button.isEnabled(), true);
  await page.locator('.question-select').first().check();
  await page.locator('#selected-count').filter({ hasText: '1' }).waitFor();
  await page.locator('#header-title').fill('Teste DOCX da interface');
  await page.locator('#variants-count').selectOption('5');
  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  await button.click();
  const download = await downloadPromise;
  const archive = await JSZip.loadAsync(await (await import('node:fs/promises')).readFile(await download.path()));
  assert.equal(Object.keys(archive.files).length, 10);
  for (const [name, file] of Object.entries(archive.files)) {
    const docx = await JSZip.loadAsync(await file.async('uint8array'));
    const xml = await docx.file('word/document.xml').async('string');
    assert.match(xml, /Teste DOCX da interface/);
    assert.doesNotMatch(xml, /asset:|\[Imagem:/);
    if (name.includes('aluno')) assert.doesNotMatch(xml, /Resposta correta|Gabarito/);
    else assert.match(xml, /Resposta correta|Gabarito/);
  }
  await page.waitForFunction(() => !document.querySelector('#btn-export-docx').disabled);
  assert.equal(await button.innerText(), 'Baixar versão DOCX');
  // A mesma proteção contra imagens ausentes deve valer no PDF.
  await page.locator('#search-query').fill('cianeto');
  await page.locator('#search-form button[type="submit"]').click();
  await page.locator('.question-select[data-question-id="2607"]').waitFor();
  await page.locator('.question-select[data-question-id="2607"]').check();
  await page.context().route('**/media/**', route => route.abort());
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#btn-print-student').click();
  const popup = await popupPromise;
  await page.getByText('Uma imagem da prova não carregou. Confira sua conexão e tente gerar o PDF novamente.', { exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('#btn-export-docx').disabled);
  assert.equal(popup.isClosed(), true);
  assert.deepEqual(errors, []);
  console.log('DOCX browser: seleção, erro sem questões, recuperação do botão, download, 5 variantes aluno/professor e bloqueio de PDF com imagem ausente OK.');
} finally {
  await browser.close();
}
