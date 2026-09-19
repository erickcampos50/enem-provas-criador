import $ from 'jquery';
import * as bootstrap from 'bootstrap';
import './styles.css';
import { DbClient } from './db-client.js';
import { loadDatabaseBytes } from './cache.js';
import { buildVariants } from './variants.js';
import { exportVariants, getUniqueQuestionFiles, renderHtmlDocument } from './exports.js';
import { renderMarkdown } from './markdown.js';
import { clearDraft, dismissWelcome, downloadText, encodeProofLink, exportProof, parseProof, parseProofLink, readDraft, shouldShowWelcome, writeDraft } from './storage.js';

window.$ = $;
window.bootstrap = bootstrap;

const db = new DbClient();
const state = {
  filters: { q: '', year: '', discipline: '', language: '', hasImages: false },
  results: [],
  totalResults: 0,
  page: 1,
  pageSize: 20,
  selected: [],
  questionCache: new Map(),
  header: {
    institution: '', title: '', subject: '', teacher: '', className: '', date: '', period: '', duration: '', totalValue: '', instructions: '',
  },
  variantsCount: 1,
  shuffleIncorrect: false,
  includeAnswerSheet: true,
  previewTeacher: false,
  previewVariant: 0,
  filtersData: { years: [], disciplines: [], languages: [] },
  database: { sha256: '', questionCount: 0, examCount: 0 },
  draftSavedAt: null,
  pendingSharedProof: null,
};

let draftTimer;
let previewTimer;
let draggedId = null;
let searchRequestId = 0;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function normalizeSnippet(value) {
  return String(value ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<img\b[^>]*>/gi, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function showToast(message, type = 'info') {
  const id = `toast-${Date.now()}`;
  const html = `<div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert"><div class="d-flex"><div class="toast-body">${escapeHtml(message)}</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>`;
  $('.toast-container').append(html);
  const element = document.getElementById(id);
  const toast = bootstrap.Toast.getOrCreateInstance(element, { delay: 4500 });
  toast.show();
  element.addEventListener('hidden.bs.toast', () => element.remove());
}

function formatCount(value) {
  return new Intl.NumberFormat('pt-BR').format(Number(value) || 0);
}

function formatSavedAt(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function updateDraftStatus(message, kind = 'muted') {
  $('#draft-status, #proof-save-status')
    .text(message)
    .removeClass('text-secondary text-success text-danger text-warning')
    .addClass({ muted: 'text-secondary', success: 'text-success', danger: 'text-danger', pending: 'text-warning' }[kind] || 'text-secondary');
}

function saveDraftNow({ notify = false } = {}) {
  try {
    state.draftSavedAt = writeDraft(state);
    updateDraftStatus('Salvo neste navegador às ' + formatSavedAt(state.draftSavedAt), 'success');
    if (notify) showToast('Prova salva neste navegador.', 'success');
  } catch (error) {
    updateDraftStatus('Não foi possível salvar neste navegador.', 'danger');
    showToast('Não foi possível salvar a prova localmente: ' + error.message, 'danger');
  }
}

function scheduleDraft() {
  clearTimeout(draftTimer);
  updateDraftStatus('Salvando…', 'pending');
  draftTimer = setTimeout(() => saveDraftNow(), 350);
}

function selectOptions(items, selected, placeholder) {
  return [`<option value="">${placeholder}</option>`, ...items.map((item) => `<option value="${escapeHtml(item.value ?? item)}" ${String(item.value ?? item) === String(selected) ? 'selected' : ''}>${escapeHtml(item.label ?? item)}</option>`)].join('');
}

function shell() {
  $('#app').html(`
    <div class="app-shell">
      <header class="app-header py-3 mb-4">
        <div class="container-fluid px-4 d-flex flex-wrap align-items-center gap-3">
          <div><h1 class="h4 mb-0">Provas ENEM para Professores</h1><small class="opacity-75">Crie avaliações fundamentadas a partir de questões do ENEM.</small></div>
          <span id="db-status" class="badge rounded-pill">Carregando base local…</span>
          <div class="ms-auto d-flex gap-2 no-print">
            <button class="btn btn-sm btn-light" id="btn-save-share">Salvar e compartilhar prova</button>
          </div>
        </div>
      </header>
      <main class="container-fluid px-4 pb-5">
        <div id="app-alert" class="alert d-none" role="alert"></div>
        <details id="welcome-notice" class="welcome-notice alert alert-info ${shouldShowWelcome() ? '' : 'd-none'}">
          <summary>Como funciona esta ferramenta?</summary>
          <div class="welcome-content small mt-2"><ul class="mb-0 ps-3"><li><strong>Finalidade:</strong> encontre questões confiáveis e crie rapidamente provas bem fundamentadas para ajudar seus alunos a se familiarizarem com o ENEM.</li><li><strong>Pesquisa:</strong> use a busca livre no contexto, na introdução e nas alternativas; combine ano, área, idioma e presença de imagens.</li><li><strong>Trabalhos salvos:</strong> a prova é salva automaticamente neste navegador. Use o botão de salvar e compartilhar para baixar um arquivo ou gerar um link para uso futuro.</li><li><strong>Variantes:</strong> gere de 1 a 5 versões da mesma prova. As versões reorganizam as alternativas e produzem gabaritos correspondentes para dificultar cópias.</li><li><strong>Imagens:</strong> as figuras continuam referenciadas pelas URLs originais e precisam de conexão quando forem carregadas.</li></ul></div>
          <button type="button" class="btn btn-sm btn-outline-info mt-3" id="btn-dismiss-welcome">Entendi, não mostrar novamente</button>
        </details>
        <div class="row g-4">
          <section class="col-xl-7">
            <div class="card library-card">
              <div class="card-body">
                <div class="d-flex align-items-center justify-content-between gap-3 mb-3"><div><h2 class="h5 mb-1">Biblioteca de questões</h2><p class="text-secondary small mb-0">Pesquise pelo contexto, introdução ou alternativas.</p></div><button class="btn btn-sm btn-outline-secondary" id="btn-clear-search">Limpar</button></div>
                <form id="search-form" class="row g-2 mb-3">
                  <div class="col-md-7"><label class="form-label" for="search-query">Busca livre</label><input class="form-control" id="search-query" placeholder="Ex.: fotossíntese, urbanização…"></div>
                  <div class="col-md-5"><label class="form-label" for="filter-year">Ano</label><select class="form-select" id="filter-year"></select></div>
                  <div class="col-md-4"><label class="form-label" for="filter-discipline">Área/disciplina</label><select class="form-select" id="filter-discipline"></select></div>
                  <div class="col-md-4"><label class="form-label" for="filter-language">Idioma</label><select class="form-select" id="filter-language"></select></div>
                  <div class="col-md-4 d-flex align-items-end"><div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="filter-images"><label class="form-check-label" for="filter-images">Somente com imagens</label></div></div>
                  <div class="col-12 d-flex justify-content-between align-items-center"><button class="btn btn-primary" type="submit">Pesquisar</button><div class="form-check"><input class="form-check-input" type="checkbox" id="filter-hide-selected"><label class="form-check-label small" for="filter-hide-selected">Ocultar selecionadas</label></div></div>
                </form>
                <div class="d-flex justify-content-between align-items-center border-top pt-3 mb-2"><span id="result-count" class="small text-secondary" role="status" aria-live="polite">Nenhuma busca realizada</span><button class="btn btn-sm btn-outline-primary" id="btn-select-visible">Selecionar visíveis</button></div>
                <div id="search-results" class="vstack gap-2"><div class="empty-state">Faça uma busca para explorar as questões.</div></div>
                <div id="pagination" class="d-flex justify-content-center gap-2 mt-3"></div>
              </div>
            </div>
          </section>
          <aside class="col-xl-5 sidebar">
            <div class="sticky-builder vstack gap-4">
              <div class="card builder-card"><div class="card-body"><div class="d-flex justify-content-between align-items-center mb-3"><div><h2 class="h5 mb-1">Prova em construção</h2><p class="small text-secondary mb-0"><span id="selected-count">0</span> questões · <span id="total-points">0</span> pontos</p><p id="draft-status" class="draft-status text-secondary mb-0" role="status" aria-live="polite">Salvamento automático ativado neste navegador.</p></div><button class="btn btn-sm btn-outline-danger" id="btn-clear-proof">Limpar</button></div><div id="selected-list" class="vstack gap-2"><div class="empty-state">Selecione questões na biblioteca.</div></div></div></div>
              <div class="card builder-card"><div class="card-body"><h2 class="h5">Identificação</h2><div class="row g-2" id="header-fields">
                ${[['institution','Instituição'],['title','Nome da avaliação'],['subject','Disciplina'],['teacher','Professor'],['className','Turma'],['date','Data'],['period','Bimestre/período'],['duration','Duração'],['totalValue','Valor da prova']].map(([key,label]) => `<div class="col-md-6"><label class="form-label" for="header-${key}">${label}</label><input class="form-control form-control-sm" id="header-${key}" data-header="${key}"></div>`).join('')}
                <div class="col-12"><label class="form-label" for="header-instructions">Instruções para os alunos</label><textarea class="form-control form-control-sm" rows="2" id="header-instructions" data-header="instructions"></textarea></div>
              </div></div></div>
              <div class="card builder-card"><div class="card-body"><h2 class="h5">Gerar a prova e exportar</h2><p class="small text-secondary mb-3">Escolha quantas versões você precisa e entenda o que cada material entrega antes de baixar.</p><div class="row g-3 mb-3"><div class="col-12"><label class="form-label" for="variants-count">Quantidade de variantes</label><select class="form-select form-select-sm" id="variants-count"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select><div id="variants-help" class="form-text">Uma variante é uma versão da mesma prova com outra ordem de alternativas. A Variante A preserva a ordem original; as seguintes deslocam a resposta correta e geram um gabarito próprio.</div></div><div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="shuffle-incorrect"><label class="form-check-label small" for="shuffle-incorrect">Embaralhar alternativas incorretas</label><div id="shuffle-help" class="form-text ms-4">Também reorganiza, de forma determinística, as alternativas erradas. Desmarcado, elas mantêm a ordem original e apenas a posição da correta muda.</div></div></div><div class="col-12"><div class="form-check"><input class="form-check-input" type="checkbox" id="include-answer-sheet" checked><label class="form-check-label small" for="include-answer-sheet">Incluir folha de respostas na versão do aluno</label><div id="answer-sheet-help" class="form-text ms-4">Acrescenta uma folha compacta para o aluno preencher, com identificação da variante e espaço para entregar junto com a prova.</div></div></div></div><div class="pdf-primary-action"><button class="btn btn-primary btn-lg" id="btn-print-student"><span class="pdf-action-icon">PDF</span><span><strong>Baixar prova em PDF</strong><small>Versão do aluno · pronta para imprimir</small></span></button><p class="pdf-action-help">O navegador abrirá a visualização de impressão para você salvar a prova em PDF. O gabarito não aparece nesta versão.</p></div><div class="d-flex flex-wrap gap-2"><button class="btn btn-outline-primary btn-sm" id="btn-print-teacher">Baixar gabarito do professor</button><button class="btn btn-outline-secondary btn-sm" id="btn-export-files">Exportar HTML e Markdown</button><button class="btn btn-outline-secondary btn-sm" id="btn-export-zip">Baixar ZIP completo</button></div></div></div>
            </div>
          </aside>
        </div>
      </main>
      <section class="exam-preview-section" id="exam-preview-section" aria-labelledby="exam-preview-title">
        <div class="preview-section-header">
          <div>
            <span class="preview-eyebrow">Revisão final</span>
            <h2 class="h4 mb-1" id="exam-preview-title">Pré-visualização da prova</h2>
            <p class="text-secondary small mb-0">Confira a composição, a identificação e a ordem das questões antes de gerar o PDF.</p>
          </div>
          <div class="preview-controls">
            <label class="form-label small mb-1" for="preview-variant">Variante</label>
            <select class="form-select form-select-sm" id="preview-variant" aria-label="Variante da pré-visualização"></select>
            <button type="button" class="btn btn-primary btn-sm w-100 mt-2" id="btn-preview-pdf">Baixar PDF desta visualização</button><div class="btn-group btn-group-sm mt-2" role="group" aria-label="Versão da pré-visualização">
              <button type="button" class="btn btn-primary" id="preview-student">Aluno</button>
              <button type="button" class="btn btn-outline-primary" id="preview-teacher">Professor</button>
            </div>
          </div>
        </div>
        <div class="preview-status" id="preview-status" aria-live="polite">Adicione questões para visualizar a prova.</div>
        <div class="exam-preview-viewport" id="exam-preview-viewport">
          <div class="preview-empty" id="preview-empty">A pré-visualização aparecerá aqui assim que uma questão for adicionada à prova.</div>
          <iframe class="exam-preview-frame d-none" id="exam-preview-frame" title="Pré-visualização da prova"></iframe>
        </div>
      </section>
      <div class="toast-container position-fixed bottom-0 end-0 p-3"></div>
      <div class="modal fade" id="question-modal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-xl modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5">Pré-visualização</h2><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body question-preview"></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div></div></div></div>
      <div class="modal fade" id="proof-storage-modal" tabindex="-1" aria-labelledby="proof-storage-title" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="proof-storage-title">Salvar e compartilhar prova</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button></div><div class="modal-body"><p id="proof-save-status" class="storage-status text-secondary" role="status" aria-live="polite">Salvamento automático ativado neste navegador.</p><div class="storage-option"><h3 class="h6">Salvar neste navegador</h3><p class="small text-secondary">Mantenha a prova disponível mesmo depois de fechar ou atualizar esta página.</p><button type="button" class="btn btn-outline-primary" id="btn-save-now">Salvar agora</button></div><div class="storage-option"><h3 class="h6">Compartilhar por link</h3><p class="small text-secondary">O link guarda a composição da prova e funciona quando a mesma base local estiver disponível.</p><button type="button" class="btn btn-primary" id="btn-create-link">Criar link compartilhável</button><div id="share-link-panel" class="d-none mt-3"><label class="form-label small" for="proof-link">Link da prova</label><div class="input-group"><input class="form-control form-control-sm" id="proof-link" readonly><button type="button" class="btn btn-outline-secondary" id="btn-copy-link">Copiar</button></div><div id="share-link-status" class="small text-secondary mt-2" role="status" aria-live="polite"></div></div></div><div class="storage-option"><h3 class="h6">Arquivo da prova</h3><p class="small text-secondary">Baixe um arquivo para guardar ou abra um arquivo recebido de outra pessoa.</p><div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-outline-primary" id="btn-download-proof">Baixar arquivo da prova</button><button type="button" class="btn btn-outline-secondary" id="btn-open-proof">Abrir arquivo da prova</button><input type="file" id="proof-file" accept="application/json,.json" class="d-none"></div></div><div class="storage-option storage-option-danger"><h3 class="h6">Limpar salvamento local</h3><p class="small text-secondary">Remove o rascunho salvo neste navegador. A prova atualmente aberta não será apagada.</p><button type="button" class="btn btn-outline-danger" id="btn-clear-draft">Limpar rascunho salvo</button></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button></div></div></div></div>
      <div class="modal fade" id="shared-proof-modal" tabindex="-1" aria-labelledby="shared-proof-title" aria-hidden="true"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header"><h2 class="modal-title h5" id="shared-proof-title">Abrir prova compartilhada</h2><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button></div><div class="modal-body"><p id="shared-proof-message"></p><div id="shared-proof-warning" class="alert alert-warning d-none" role="alert"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Agora não</button><button type="button" class="btn btn-primary" id="btn-open-shared-proof">Abrir prova</button></div></div></div></div>
      <div class="loading-overlay" id="loading-overlay"><div class="text-center"><div class="spinner-border text-primary mb-3"></div><p id="loading-message" class="mb-0">Abrindo banco de questões…</p></div></div>
    </div>`);
}

function renderFilters() {
  $('#filter-year').html(selectOptions(state.filtersData.years, state.filters.year, 'Todos os anos'));
  $('#filter-discipline').html(selectOptions(state.filtersData.disciplines, state.filters.discipline, 'Todas as áreas'));
  $('#filter-language').html(selectOptions(state.filtersData.languages, state.filters.language, 'Todos os idiomas'));
}

function flashSelectedQuestion(id) {
  const card = document.querySelector('.question-result[data-question-id="' + id + '"]');
  if (!card) return;
  card.classList.remove('just-selected');
  void card.offsetWidth;
  card.classList.add('just-selected');
  setTimeout(() => card.classList.remove('just-selected'), 900);
}

function renderResults() {
  const selectedIds = new Set(state.selected.map((item) => item.id));
  $('#result-count').text(state.totalResults ? formatCount(state.totalResults) + ' questão(ões) encontrada(s)' : 'Nenhum resultado');
  if (!state.results.length) {
    $('#search-results').html('<div class="empty-state">Nenhuma questão corresponde aos filtros.</div>');
  } else {
    $('#search-results').html(state.results.map((result) => `<article class="question-result card card-body p-3 ${selectedIds.has(result.id) ? 'selected' : ''}" data-question-id="${result.id}"><div class="d-flex gap-2 align-items-start"><input class="form-check-input mt-1 question-select" type="checkbox" data-question-id="${result.id}" ${selectedIds.has(result.id) ? 'checked' : ''}><div class="flex-grow-1"><div class="d-flex justify-content-between gap-2"><button class="btn btn-link p-0 text-start text-decoration-none result-title" data-preview-id="${result.id}">${escapeHtml(result.title)}</button><span class="badge text-bg-light">${escapeHtml(result.year)}${result.language ? ` · ${escapeHtml(result.language)}` : ''}</span></div><div class="small text-secondary">${escapeHtml(result.discipline || 'Sem disciplina')}${result.hasImages ? ' · 🖼️ imagens' : ''}</div><div class="result-snippet mt-1">${escapeHtml(normalizeSnippet(result.snippet) || 'Sem trecho textual disponível.')}</div></div></div></article>`).join(''));
  }
  const pages = Math.ceil(state.totalResults / state.pageSize);
  $('#pagination').html(pages > 1 ? `<button class="btn btn-sm btn-outline-secondary" data-page="${state.page - 1}" ${state.page <= 1 ? 'disabled' : ''}>Anterior</button><span class="small align-self-center">Página ${state.page} de ${pages}</span><button class="btn btn-sm btn-outline-secondary" data-page="${state.page + 1}" ${state.page >= pages ? 'disabled' : ''}>Próxima</button>` : '');
}

function renderSelected() {
  $('#selected-count').text(state.selected.length);
  $('#total-points').text(state.selected.reduce((sum, item) => sum + Number(item.points || 0), 0));
  if (!state.selected.length) {
    $('#selected-list').html('<div class="empty-state">Selecione questões na biblioteca.</div>');
    return;
  }
  $('#selected-list').html(state.selected.map((item, index) => {
    const question = state.questionCache.get(item.id);
    return `<div class="selected-item card card-body p-2" draggable="true" data-selected-id="${item.id}"><div class="d-flex align-items-center gap-2"><span class="badge text-bg-primary">${index + 1}</span><button class="btn btn-link p-0 text-start text-decoration-none flex-grow-1 selected-preview" data-preview-id="${item.id}">${escapeHtml(question?.title || `Questão ${item.id}`)}</button><button class="btn btn-sm btn-outline-secondary move-up" data-selected-id="${item.id}" title="Mover para cima">↑</button><button class="btn btn-sm btn-outline-secondary move-down" data-selected-id="${item.id}" title="Mover para baixo">↓</button><button class="btn btn-sm btn-outline-danger remove-selected" data-selected-id="${item.id}" title="Remover">×</button></div><div class="input-group input-group-sm mt-2"><span class="input-group-text">Pontos</span><input class="form-control selected-points" type="number" min="0" step="0.1" value="${escapeHtml(item.points ?? 1)}" data-selected-id="${item.id}"></div></div>`;
  }).join(''));
}

function renderQuestion(question, teacher = true) {
  const files = getUniqueQuestionFiles(question).map((url, index) => `<img src="${escapeHtml(url)}" alt="Imagem de apoio ${index + 1}" class="question-image">`).join('');
  const alternatives = (question.alternatives || []).map((alternative) => `<div class="alternative ${teacher && alternative.isCorrect ? 'correct' : ''}"><span class="alternative-letter">${escapeHtml(alternative.letter)})</span><div>${alternative.text ? renderMarkdown(alternative.text) : alternative.file ? `<img src="${escapeHtml(alternative.file)}" alt="Imagem da alternativa ${escapeHtml(alternative.letter)}" class="question-image">` : '<span>Sem texto ou imagem.</span>'}</div></div>`).join('');
  return `<div><h3 class="h5">${escapeHtml(question.title)}</h3><div>${renderMarkdown(question.context)}</div>${files}<div>${renderMarkdown(question.alternativesIntroduction)}</div>${alternatives}<div class="small text-secondary mt-3">${escapeHtml(question.year)} · ${escapeHtml(question.discipline || 'Sem disciplina')}${question.language ? ` · ${escapeHtml(question.language)}` : ''}</div></div>`;
}

async function showPreview(id) {
  try {
    const question = await ensureQuestion(id);
    $('#question-modal .modal-body').html(renderQuestion(question, true));
    bootstrap.Modal.getOrCreateInstance(document.getElementById('question-modal')).show();
  } catch (error) { showToast(error.message, 'danger'); }
}

async function ensureQuestion(id) {
  const cached = state.questionCache.get(id);
  if (!cached?.alternatives) {
    const response = await db.getQuestion(id);
    const question = response.question ?? response;
    state.questionCache.set(id, {
      ...question,
      files: question.files ?? response.urls ?? [],
      alternatives: (question.alternatives ?? response.alternatives ?? []).map((alternative) => ({
        ...alternative,
        file: alternative.file ?? alternative.fileUrl ?? null,
      })),
    });
  }
  return state.questionCache.get(id);
}

async function setSelected(id, selected, { notify = true } = {}) {
  const wasSelected = state.selected.some((item) => item.id === id);
  if (selected && !wasSelected) {
    await ensureQuestion(id);
    state.selected.push({ id, points: 1 });
  } else if (!selected && wasSelected) {
    state.selected = state.selected.filter((item) => item.id !== id);
  } else {
    return false;
  }
  scheduleDraft(); renderSelected(); renderResults(); schedulePreview();
  flashSelectedQuestion(id);
  if (notify) showToast(selected ? 'Questão adicionada à prova.' : 'Questão removida da prova.', 'success');
  return true;
}

function setSearchBusy(busy) {
  const pagination = $('#pagination');
  pagination.attr('aria-busy', busy ? 'true' : 'false');
  pagination.find('button').prop('disabled', busy);
  $('#search-form button[type="submit"]').prop('disabled', busy).attr('aria-busy', busy ? 'true' : 'false');
}

async function performSearch(page = 1, { notify = false } = {}) {
  const requestId = ++searchRequestId;
  const previousPage = state.page;
  state.page = page;
  state.filters.q = $('#search-query').val().trim();
  state.filters.year = $('#filter-year').val();
  state.filters.discipline = $('#filter-discipline').val();
  state.filters.language = $('#filter-language').val();
  state.filters.hasImages = $('#filter-images').prop('checked') ? true : undefined;
  const hideSelected = $('#filter-hide-selected').prop('checked');
  setSearchBusy(true);
  try {
    const response = await db.searchQuestions({ ...state.filters, excludeIds: hideSelected ? state.selected.map((item) => item.id) : [], page, pageSize: state.pageSize });
    if (requestId !== searchRequestId) return;
    state.results = response.results; state.totalResults = response.total; response.results.forEach((item) => state.questionCache.set(item.id, { ...state.questionCache.get(item.id), ...item })); renderResults();
    if (notify) showToast(response.total ? 'Busca concluída: ' + formatCount(response.total) + ' questões encontradas.' : 'Nenhuma questão encontrada com esses critérios.', response.total ? 'success' : 'info');
  } catch (error) {
    if (requestId !== searchRequestId) return;
    state.page = previousPage;
    renderResults();
    showToast(error.message, 'danger');
  } finally {
    if (requestId === searchRequestId) setSearchBusy(false);
  }
}

function openStorageModal() {
  updateDraftStatus(state.draftSavedAt ? 'Salvo neste navegador às ' + formatSavedAt(state.draftSavedAt) : 'Salvamento automático ativado neste navegador.', state.draftSavedAt ? 'success' : 'muted');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('proof-storage-modal')).show();
}

function closeStorageModal() {
  bootstrap.Modal.getOrCreateInstance(document.getElementById('proof-storage-modal')).hide();
}

function clearLocationHash() {
  const url = new URL(window.location.href);
  url.hash = '';
  window.history.replaceState(null, '', url.href);
}

function showSharedProofDialog(proof) {
  state.pendingSharedProof = proof;
  $('#shared-proof-message').text('Este link contém uma prova com ' + formatCount(proof.selected.length) + ' questão(ões). Deseja abrir essa composição e substituir a prova atualmente aberta?');
  const mismatch = proof.databaseHash !== state.database.sha256;
  $('#shared-proof-warning').toggleClass('d-none', !mismatch).text(mismatch ? 'O link foi criado com outra versão da base. A restauração só será feita se todas as questões ainda estiverem disponíveis nesta base.' : '');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('shared-proof-modal')).show();
}

async function restoreProof(value) {
  const missing = [];
  for (const item of value.selected) {
    try {
      await ensureQuestion(item.id);
    } catch {
      missing.push(item.id);
    }
  }
  if (missing.length) throw new Error('Não foi possível localizar ' + formatCount(missing.length) + ' questão(ões) nesta base.');
  state.header = { ...state.header, ...value.header };
  state.selected = value.selected.map((item) => ({ id: Number(item.id), points: Number(item.points ?? 1) }));
  state.variantsCount = Math.min(5, Math.max(1, Number(value.variantsCount) || 1));
  state.shuffleIncorrect = Boolean(value.shuffleIncorrect);
  state.includeAnswerSheet = value.includeAnswerSheet !== false;
  fillHeader(); scheduleDraft(); renderSelected(); renderResults(); schedulePreview();
}

async function openSharedProof() {
  const proof = state.pendingSharedProof;
  if (!proof) return;
  const button = $('#btn-open-shared-proof');
  button.prop('disabled', true).text('Abrindo…');
  try {
    await restoreProof(proof);
    state.pendingSharedProof = null;
    clearLocationHash();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('shared-proof-modal')).hide();
    showToast('Prova compartilhada aberta.', 'success');
  } catch (error) {
    showToast(error.message, 'danger');
  } finally {
    button.prop('disabled', false).text('Abrir prova');
  }
}

function currentVariants() {
  const questions = state.selected.map((item) => ({ ...(state.questionCache.get(item.id) || {}), points: item.points }));
  if (!questions.length) throw new Error('Adicione pelo menos uma questão à prova.');
  return buildVariants(questions, state.variantsCount, state.shuffleIncorrect);
}

function renderPreviewVariantOptions() {
  const count = Math.min(5, Math.max(1, Number(state.variantsCount) || 1));
  state.previewVariant = Math.min(state.previewVariant, count - 1);
  $('#preview-variant').html(Array.from({ length: count }, (_, index) => {
    const label = String.fromCharCode(65 + index);
    return '<option value="' + index + '">Variante ' + label + '</option>';
  }).join('')).val(String(state.previewVariant));
}

function updatePreviewModeButtons() {
  $('#preview-student').toggleClass('btn-primary', !state.previewTeacher).toggleClass('btn-outline-primary', state.previewTeacher);
  $('#preview-teacher').toggleClass('btn-primary', state.previewTeacher).toggleClass('btn-outline-primary', !state.previewTeacher);
}

function renderPreview() {
  const frame = document.getElementById('exam-preview-frame');
  if (!frame) return;
  renderPreviewVariantOptions();
  updatePreviewModeButtons();
  const variants = state.selected.length ? currentVariants() : [];
  const label = String.fromCharCode(65 + state.previewVariant);
  $('#preview-status').text(variants.length
    ? state.selected.length + ' questão(ões) · ' + state.selected.reduce((sum, item) => sum + Number(item.points || 0), 0).toLocaleString('pt-BR') + ' pontos · Variante ' + label + ' · Versão do ' + (state.previewTeacher ? 'professor' : 'aluno')
    : 'Adicione questões para visualizar a prova.');
  if (!variants.length) {
    $('#preview-empty').removeClass('d-none');
    $(frame).addClass('d-none').removeAttr('srcdoc');
    return;
  }
  const variant = variants[state.previewVariant];
  $('#preview-empty').addClass('d-none');
  frame.onload = async () => {
    try {
      await waitForPrintImages(frame.contentWindow);
      const contentHeight = frame.contentDocument?.documentElement?.scrollHeight ?? 0;
      frame.style.height = Math.max(760, Math.min(contentHeight + 24, 1800)) + "px";
    } catch {
      frame.style.height = "900px";
    }
  };
  $(frame).removeClass('d-none');
  frame.srcdoc = renderHtmlDocument(state.header, variant, state.previewTeacher, !state.previewTeacher && state.includeAnswerSheet);
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, 120);
}

function moveSelected(id, direction) {
  const index = state.selected.findIndex((item) => item.id === id); const target = index + direction;
  if (index < 0 || target < 0 || target >= state.selected.length) return;
  [state.selected[index], state.selected[target]] = [state.selected[target], state.selected[index]];
  scheduleDraft(); renderSelected(); schedulePreview();
}

function fillHeader() {
  Object.entries(state.header).forEach(([key, value]) => $(`[data-header="${key}"]`).val(value));
  $('#variants-count').val(state.variantsCount); $('#shuffle-incorrect').prop('checked', state.shuffleIncorrect); $('#include-answer-sheet').prop('checked', state.includeAnswerSheet);
}

function waitForPrintImages(printWindow) {
  const images = [...printWindow.document.images];
  return Promise.all(images.map((image) => new Promise((resolve) => {
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
    setTimeout(finish, 5000);
  })));
}

function printWithFrame(html) {
  const frame = document.createElement('iframe');
  frame.title = 'Documento para impressão';
  frame.className = 'print-frame';
  frame.srcdoc = html;
  document.body.append(frame);

  const printWindow = async () => {
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      frame.remove();
      showToast('Não foi possível preparar o documento para impressão.', 'danger');
      return;
    }
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      frame.remove();
    };
    await waitForPrintImages(frameWindow);
    frameWindow.addEventListener('afterprint', cleanup, { once: true });
    frameWindow.focus();
    frameWindow.print();
    setTimeout(cleanup, 60_000);
  };

  frame.addEventListener('load', printWindow, { once: true });
}

function openPrint(teacher, variantIndex = 0) {
  try {
    const variants = currentVariants();
    const variant = variants[Math.min(Math.max(Number(variantIndex) || 0, 0), variants.length - 1)];
    const html = renderHtmlDocument(state.header, variant, teacher, !teacher && state.includeAnswerSheet);
    // Não usar noopener/noreferrer aqui: alguns navegadores retornam null mesmo
    // quando a janela foi aberta pelo clique do usuário, impedindo a impressão.
    const popup = window.open('', '_blank');
    if (!popup) {
      printWithFrame(html);
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    const printPopup = async () => {
      await waitForPrintImages(popup);
      popup.focus();
      popup.print();
    };
    if (popup.document.readyState === 'complete') setTimeout(() => { void printPopup(); }, 50);
    else popup.addEventListener('load', () => { void printPopup(); }, { once: true });
  } catch (error) { showToast(error.message, 'danger'); }
}

async function restoreBackup(value) {
  state.header = { ...state.header, ...value.header }; state.selected = value.selected.map((item) => ({ id: Number(item.id), points: Number(item.points ?? 1) })); state.variantsCount = Math.min(5, Math.max(1, Number(value.variantsCount) || 1)); state.shuffleIncorrect = Boolean(value.shuffleIncorrect); state.includeAnswerSheet = value.includeAnswerSheet !== false;
  for (const item of state.selected) await ensureQuestion(item.id);
  fillHeader(); scheduleDraft(); renderSelected(); renderResults(); schedulePreview();
}

function bindEvents() {
  $('#search-form').on('submit', (event) => { event.preventDefault(); void performSearch(1, { notify: true }); });
  $('#btn-clear-search').on('click', () => { $('#search-query').val(''); $('#filter-year,#filter-discipline,#filter-language').val(''); $('#filter-images,#filter-hide-selected').prop('checked', false); void performSearch(1, { notify: true }); });
  $('#search-results').on('change', '.question-select', (event) => { void setSelected(Number(event.currentTarget.dataset.questionId), event.currentTarget.checked).catch((error) => showToast(error.message, 'danger')); });
  $('#search-results').on('click', '[data-preview-id]', (event) => { event.preventDefault(); void showPreview(Number(event.currentTarget.dataset.previewId)); });
  $('#btn-select-visible').on('click', async () => {
    const before = state.selected.length;
    try {
      for (const result of state.results) await setSelected(result.id, true, { notify: false });
      const added = state.selected.length - before;
      showToast(added ? formatCount(added) + ' questão(ões) adicionada(s) à prova.' : 'As questões visíveis já estão selecionadas.', added ? 'success' : 'info');
    } catch (error) { showToast(error.message, 'danger'); }
  });
  $('#pagination').on('click', '[data-page]', (event) => { const page = Number(event.currentTarget.dataset.page); if (page > 0) void performSearch(page); });
  $('#selected-list').on('click', '.remove-selected', (event) => { void setSelected(Number(event.currentTarget.dataset.selectedId), false).catch((error) => showToast(error.message, 'danger')); });
  $('#selected-list').on('click', '.move-up', (event) => moveSelected(Number(event.currentTarget.dataset.selectedId), -1));
  $('#selected-list').on('click', '.move-down', (event) => moveSelected(Number(event.currentTarget.dataset.selectedId), 1));
  $('#selected-list').on('click', '[data-preview-id]', (event) => { void showPreview(Number(event.currentTarget.dataset.previewId)); });
  $('#selected-list').on('change', '.selected-points', (event) => { const item = state.selected.find((candidate) => candidate.id === Number(event.currentTarget.dataset.selectedId)); if (item) item.points = Number(event.currentTarget.value) || 0; scheduleDraft(); renderSelected(); schedulePreview(); });
  $('#selected-list').on('dragstart', '.selected-item', (event) => { draggedId = Number(event.currentTarget.dataset.selectedId); event.currentTarget.classList.add('dragging'); });
  $('#selected-list').on('dragend', '.selected-item', (event) => { event.currentTarget.classList.remove('dragging'); draggedId = null; });
  $('#selected-list').on('dragover', '.selected-item', (event) => event.preventDefault());
  $('#selected-list').on('drop', '.selected-item', (event) => { event.preventDefault(); const targetId = Number(event.currentTarget.dataset.selectedId); if (!draggedId || draggedId === targetId) return; const from = state.selected.findIndex((item) => item.id === draggedId); const to = state.selected.findIndex((item) => item.id === targetId); const [item] = state.selected.splice(from, 1); state.selected.splice(to, 0, item); scheduleDraft(); renderSelected(); schedulePreview(); });
  $('#header-fields').on('input', '[data-header]', (event) => { state.header[event.currentTarget.dataset.header] = event.currentTarget.value; scheduleDraft(); schedulePreview(); });
  $('#variants-count').on('change', (event) => { state.variantsCount = Number(event.currentTarget.value); renderPreviewVariantOptions(); scheduleDraft(); schedulePreview(); });
  $('#shuffle-incorrect').on('change', (event) => { state.shuffleIncorrect = event.currentTarget.checked; scheduleDraft(); schedulePreview(); });
  $('#include-answer-sheet').on('change', (event) => { state.includeAnswerSheet = event.currentTarget.checked; scheduleDraft(); schedulePreview(); });
  $('#btn-clear-proof').on('click', () => { if (confirm('Remover todas as questões da prova?')) { state.selected = []; scheduleDraft(); renderSelected(); renderResults(); schedulePreview(); showToast('Questões removidas da prova.', 'success'); } });
  $('#preview-variant').on('change', (event) => { state.previewVariant = Number(event.currentTarget.value) || 0; renderPreview(); });
  $('#preview-student').on('click', () => { state.previewTeacher = false; renderPreview(); });
  $('#preview-teacher').on('click', () => { state.previewTeacher = true; renderPreview(); });
  $('#btn-export-files').on('click', async () => { try { await exportVariants(state.header, currentVariants(), { includeAnswerSheet: state.includeAnswerSheet }); showToast('Arquivos da prova gerados.', 'success'); } catch (error) { showToast(error.message, 'danger'); } });
  $('#btn-export-zip').on('click', async () => { try { await exportVariants(state.header, currentVariants(), { includeAnswerSheet: state.includeAnswerSheet, zip: true }); showToast('ZIP da prova gerado.', 'success'); } catch (error) { showToast(error.message, 'danger'); } });
  $('#btn-print-student').on('click', () => openPrint(false, state.previewVariant)); $('#btn-print-teacher').on('click', () => openPrint(true, state.previewVariant));
  $('#btn-preview-pdf').on('click', () => openPrint(state.previewTeacher, state.previewVariant));
  $('#btn-save-share').on('click', openStorageModal);
  $('#btn-save-now').on('click', () => saveDraftNow({ notify: true }));
  $('#btn-create-link').on('click', () => {
    try {
      if (!state.selected.length) throw new Error('Adicione pelo menos uma questão antes de criar um link.');
      const link = encodeProofLink(state, state.database.sha256, window.location.href);
      $('#proof-link').val(link); $('#share-link-panel').removeClass('d-none'); $('#share-link-status').text('Link criado. Copie e envie para compartilhar a composição da prova.');
      showToast('Link compartilhável criado.', 'success');
    } catch (error) { showToast(error.message, 'danger'); }
  });
  $('#btn-copy-link').on('click', async () => {
    const input = document.getElementById('proof-link');
    if (!input.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      $('#share-link-status').text('Link copiado para a área de transferência.');
      showToast('Link copiado.', 'success');
    } catch {
      input.focus(); input.select();
      $('#share-link-status').text('Selecione e copie o link manualmente.');
      showToast('O link está pronto para ser copiado.', 'info');
    }
  });
  $('#btn-download-proof').on('click', () => { try { downloadText('prova-enem.json', exportProof(state)); showToast('Arquivo da prova baixado.', 'success'); } catch (error) { showToast(error.message, 'danger'); } });
  $('#btn-open-proof').on('click', () => $('#proof-file').trigger('click'));
  $('#proof-file').on('change', async (event) => { const [file] = event.currentTarget.files; if (!file) return; try { await restoreProof(parseProof(await file.text())); closeStorageModal(); showToast('Arquivo da prova aberto.', 'success'); } catch (error) { showToast(error.message, 'danger'); } event.currentTarget.value = ''; });
  $('#btn-clear-draft').on('click', () => { if (confirm('Remover o rascunho salvo neste navegador?')) { clearDraft(); state.draftSavedAt = null; updateDraftStatus('Nenhum rascunho salvo neste navegador.', 'muted'); showToast('Rascunho local removido.', 'success'); } });
  $('#btn-dismiss-welcome').on('click', () => { dismissWelcome(); $('#welcome-notice').addClass('d-none').removeAttr('open'); });
  $('#btn-open-shared-proof').on('click', () => { void openSharedProof(); });
  $('#shared-proof-modal').on('hidden.bs.modal', () => { if (state.pendingSharedProof) { state.pendingSharedProof = null; clearLocationHash(); } });
}

async function start() {
  shell(); bindEvents();
  try {
    const loaded = await loadDatabaseBytes();
    const initialized = await db.init(loaded.bytes);
    state.database = { sha256: loaded.manifest.sha256, questionCount: initialized.questionCount, examCount: initialized.examCount };
    state.filtersData = await db.getFilters(); renderFilters();
    $('#db-status').text(formatCount(initialized.questionCount) + ' questões · ' + formatCount(initialized.examCount) + ' provas').attr('title', 'Base local carregada').removeClass('bg-danger').addClass('bg-success');
    const draft = readDraft();
    if (draft) {
      state.draftSavedAt = draft.savedAt;
      updateDraftStatus('Salvo neste navegador às ' + formatSavedAt(state.draftSavedAt), 'success');
      await restoreProof(draft);
      showToast('Rascunho restaurado automaticamente.', 'info');
    }
    await performSearch(1);
    renderPreview();
    try {
      const sharedProof = parseProofLink(window.location.hash);
      if (sharedProof) showSharedProofDialog(sharedProof);
    } catch (error) {
      clearLocationHash();
      showToast(error.message, 'danger');
    }
  } catch (error) {
    $('#db-status').text('Não foi possível carregar a base').removeClass('bg-success').addClass('bg-danger');
    $('#app-alert').removeClass('d-none').addClass('alert-danger').text(error.message + ' Execute npm run sync:database antes de iniciar a aplicação.');
  } finally { $('#loading-overlay').remove(); }
}

start();
