import { jsPDF } from 'jspdf';
import { renderHtmlDocument } from './exports.js';

export const PDF_LAYOUT = Object.freeze({
  format: 'a4',
  orientation: 'portrait',
  unit: 'mm',
  pageWidth: 210,
  pageHeight: 297,
  margin: Object.freeze({ top: 13, right: 15, bottom: 20, left: 15 }),
  contentWidth: 180,
  cssDpi: 96,
});

const PDF_CSS = `
html.pdf-render, html.pdf-render body {
  width: ${PDF_LAYOUT.contentWidth}mm !important;
  min-width: ${PDF_LAYOUT.contentWidth}mm !important;
  margin: 0 !important;
  padding: 0 !important;
  background: #fff !important;
}
html.pdf-render body { overflow: visible !important; }
html.pdf-render .exam-page {
  width: ${PDF_LAYOUT.contentWidth}mm !important;
  max-width: ${PDF_LAYOUT.contentWidth}mm !important;
  margin: 0 !important;
  padding: 0 !important;
  box-shadow: none !important;
}
html.pdf-render .page-footer { display: none !important; }
html.pdf-render .exam-header,
html.pdf-render .exam-question,
html.pdf-render .answer-sheet,
html.pdf-render .answer-key {
  break-inside: avoid !important;
  page-break-inside: avoid !important;
}
html.pdf-render .page-break {
  break-before: page !important;
  page-break-before: always !important;
}
html.pdf-render .question-image {
  max-width: 100% !important;
  max-height: 72mm !important;
}
html.pdf-render img { max-width: 100% !important; }
`;

const cssPixels = Math.round((PDF_LAYOUT.contentWidth / 25.4) * PDF_LAYOUT.cssDpi);

function waitForImages(document) {
  return Promise.all([...document.images].map((image) => new Promise((resolve) => {
    if (image.complete) {
      resolve();
      return;
    }
    const finish = () => {
      image.removeEventListener('load', finish);
      image.removeEventListener('error', finish);
      resolve();
    };
    image.addEventListener('load', finish, { once: true });
    image.addEventListener('error', finish, { once: true });
    window.setTimeout(finish, 8000);
  })));
}

async function preparePdfFrame(html) {
  const frame = document.createElement('iframe');
  frame.title = 'Renderização temporária do PDF';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${cssPixels}px;height:1000px;border:0;visibility:hidden;`;
  document.body.append(frame);

  try {
    await new Promise((resolve, reject) => {
      frame.addEventListener('load', resolve, { once: true });
      frame.addEventListener('error', () => reject(new Error('Não foi possível preparar o documento PDF.')), { once: true });
      frame.srcdoc = html;
    });
    const frameDocument = frame.contentDocument;
    const root = frameDocument?.querySelector('.exam-page');
    if (!frameDocument || !root) throw new Error('O documento da prova não pôde ser renderizado.');

    frameDocument.documentElement.classList.add('pdf-render');
    const style = frameDocument.createElement('style');
    style.setAttribute('data-pdf-layout', 'true');
    style.textContent = PDF_CSS;
    frameDocument.head.append(style);
    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
    await waitForImages(frameDocument);
    return { frame, root };
  } catch (error) {
    frame.remove();
    throw error;
  }
}

function addPdfFooters(pdf, variantLabel) {
  const pageCount = pdf.internal.getNumberOfPages();
  const { left, right, bottom } = PDF_LAYOUT.margin;
  const footerLineY = PDF_LAYOUT.pageHeight - bottom + 4;
  const footerTextY = PDF_LAYOUT.pageHeight - 5;

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(170, 170, 170);
    pdf.setLineWidth(0.2);
    pdf.line(left, footerLineY, PDF_LAYOUT.pageWidth - right, footerLineY);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(85, 85, 85);
    pdf.text(`Variante ${variantLabel}`, left, footerTextY);
    pdf.text(`Página ${page} de ${pageCount}`, PDF_LAYOUT.pageWidth - right, footerTextY, { align: 'right' });
  }
  return pageCount;
}

async function renderPdf(html, title, variantLabel) {
  const { frame, root } = await preparePdfFrame(html);
  try {
    const pdf = new jsPDF({
      orientation: PDF_LAYOUT.orientation,
      unit: PDF_LAYOUT.unit,
      format: PDF_LAYOUT.format,
      compress: true,
    });
    pdf.setProperties({ title, subject: `Prova — Variante ${variantLabel}`, creator: 'Montador de Provas ENEM' });

    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      const timeout = window.setTimeout(() => finish(reject, new Error('A renderização do PDF demorou mais que o esperado.')), 60_000);
      pdf.html(root, {
        callback: (result) => {
          window.clearTimeout(timeout);
          finish(resolve, result);
        },
        x: PDF_LAYOUT.margin.left,
        y: PDF_LAYOUT.margin.top,
        width: PDF_LAYOUT.contentWidth,
        windowWidth: cssPixels,
        margin: [PDF_LAYOUT.margin.top, PDF_LAYOUT.margin.right, PDF_LAYOUT.margin.bottom, PDF_LAYOUT.margin.left],
        autoPaging: 'text',
        pagebreak: { mode: ['css', 'legacy'] },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#ffffff',
          imageTimeout: 8000,
          logging: false,
          windowWidth: cssPixels,
        },
        error: (error) => {
          window.clearTimeout(timeout);
          finish(reject, error instanceof Error ? error : new Error('Falha ao renderizar o PDF.'));
        },
      });
    });

    const pageCount = addPdfFooters(pdf, variantLabel);
    return { pdf, pageCount };
  } finally {
    frame.remove();
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPdf({ header, variant, teacher, includeAnswerSheet }) {
  const kind = teacher ? 'professor' : 'aluno';
  const filename = `prova-variante-${variant.label}-${kind}.pdf`;
  const title = header.title || 'Avaliação';
  const html = renderHtmlDocument(header, variant, teacher, !teacher && includeAnswerSheet);
  const result = await renderPdf(html, title, variant.label);
  downloadBlob(result.pdf.output('blob'), filename);
  return { ...result, filename };
}

