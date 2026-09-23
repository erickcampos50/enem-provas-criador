---
feature: enem-2024-2025-extraction
status: delivered
updated: 2026-09-23
branch: feat/enem-2024-2025-extraction
commits: 
---

# ENEM 2024–2025 + imagens locais 2009–2023

## Report

**What was built** — As 1.856 imagens de questões de 2009–2023 (antes em `https://enem.dev/...`) foram copiadas de `yunger7/enem-api/public` para `montador-enem/public/media/` e as referências no SQLite passaram ao esquema portátil `asset:media/...`, resolvido em runtime por `src/assets.js` com bases configuráveis (`VITE_ASSET_BASE_URL`, `BASE_URL`, fallback `https://erickcampos50.github.io/enem-provas-criador/`) e suporte a multi-host via `assetCandidates`. Os ENEM 2024 e 2025 foram extraídos dos PDFs oficiais Azul (D1_CD1 + D2_CD7 + gabaritos) com `extract_enem_pdf.py` (texto, alternativas, imagens, línguas Q1–5, anulados) e importados incrementalmente em `enem.sqlite` sem tocar 2009–2023 nem o enriquecimento INEP: +370 questões (185/ano), +1.850 alternativas, +469 arquivos de mídia, FTS atualizado.

**Verification** — `node --test tests/*.test.mjs` → 36 pass / 0 fail (inclui import sample e helpers de localize). `PRAGMA integrity_check` = ok; `foreign_key_check` limpo. Contagem final: 17 anos (2009–2025), 2024/2025 com 185 questões cada, 0 URLs `enem.dev` em `question_files`/`alternatives`/`context`, 2.325+ arquivos em `public/media` todos existentes, `question_inep_metadata` = 2.722 (inalterado). `npm run build` aprovado.

**Journey log** — (1) enem.dev não expõe 2024/2025 (404) → PDF oficial INEP. (2) Naming: 1º dia CD1–4, 2º dia CD5–8; caderno Azul canônico = D1_CD1 + D2_CD7. (3) 2025 não tem header “Questões de 06 a 45”; `language` grudava em `espanhol` — fix: Q>5 força `language=null` nos *dois* passes (texto e páginas/imagens). (4) `build:database` rebuild apagaria enriquecimento → importador incremental com `node:sqlite`. (5) Revisão crítica: Markdown export sem `resolveAssetUrl`; anulados com gabarito “A” falso (`''` + título Anulado); catch-all do localize criava `asset:media/broken-image.svg` (agora `asset:broken-image.svg`); `integrity_check` antes do COMMIT.

## [S1] Problem

A base canônica `enem.sqlite` cobria apenas ENEM 2009–2023 e ancorava as figuras em URLs remotas `https://enem.dev/...`. A API pública não expõe 2024/2025 (HTTP 404), e a dependência de CDN externo quebra offline, PDF e espelhos. Era preciso (a) hospedar localmente as imagens já conhecidas de 2009–2023 e (b) extrair questões e imagens de 2024–2025 — inclusive a partir dos PDFs oficiais do INEP — mantendo o contrato de dados da API enem.dev.

## [S2] Design

### [S2.1] Contrato de dados (espelha enem.dev)

Question detail (gravado em `source_documents.json_text` e normalizado em tabelas):

- `title`, `index` (1–180), `year`, `language` (`null` | `ingles` | `espanhol`), `discipline`
- `context` (Markdown, pode embutir `![](url)`), `files: string[]`, `alternativesIntroduction`
- `correctAlternative` ∈ A–E; `alternatives[{letter,text,file,isCorrect}]`

Exam summary: `title`, `year`, `disciplines[{label,value}]`, `languages[{label,value}]`, `questions[]` ordenado.

Tabelas já existentes: `exams`, `exam_disciplines`, `exam_languages`, `questions`, `exam_questions`, `alternatives`, `question_files`, `source_documents`, `search_index` (FTS5). Enriquecimento INEP (`question_inep_metadata`, `question_enrichment`) é preservado e **fora** do escopo de escrita deste feature.

### [S2.2] Esquema de URLs de imagem (portável multi-host)

Problema: URLs absolutas em `enem.dev` ou em um único host quebram troca de CDN/Pages/espelho. O esquema abaixo separa **identidade canônica do asset** de **onde ele está hospedado**.

**Forma canônica gravada no SQLite** (em `question_files.url`, `alternatives.file_url` e Markdown de `questions.context`):

```text
asset:media/<year>/questions/<index>[-<lang>]/<filename>
```

- Prefixo `asset:` torna o token inequívoco (nunca confundir com `https://...` legado ou link editorial de alternativa).
- Path após o prefixo é estável e independente de host, porta, base path ou CDN.

**Resolução em runtime** (`montador-enem/src/assets.js`):

- `ASSET_BASES` ordenado; o primeiro candidato que carrega vence (`onerror` tenta o seguinte).
- Default (em ordem):
  1. `import.meta.env.VITE_ASSET_BASE_URL` (absoluto ou base path) se definido;
  2. `import.meta.env.BASE_URL` (ex. `/enem-provas-criador/` no Pages) — same-origin;
  3. fallback absoluto do produto: `https://erickcampos50.github.io/enem-provas-criador/`.
- Qualquer URL `http(s)://` em campo de imagem continua **passthrough** (compat e links editoriais).
- Path legado sem prefixo (`2009/questions/...`) é tratado como `asset:` (com prefixo `media/` quando começa por ano).
- Exportações/impressão resolvem para a primeira base absoluta (`resolveAssetUrl(..., { absolute: true })`).

**Arquivos em disco**

- Fonte 2009–2023: clone sparse `yunger7/enem-api` → `public/`.
- Destino versionado: `montador-enem/public/media/<year>/questions/<index>[-<lang>]/<filename>` (Vite copia para `docs/`).
- Extração 2024–2025 grava no mesmo layout `public/media/...` e usa a mesma forma `asset:`.
- Idempotente: reexecutar não duplica arquivos nem regrava se já no esquema `asset:`.

**Campos reescritos vs proveniência**

- Reescritos: `question_files.url`, `alternatives.file_url`, `questions.context` (Markdown/HTML).
- `source_documents.json_text` preserva a URL remota original (auditoria).

### [S2.3] Extração 2024–2025

- Fonte primária de layout/texto/figuras: PDFs oficiais `https://download.inep.gov.br/enem/provas_e_gabaritos/` — caderno Azul canônico **D1_CD1 + D2_CD7** (D1 tem CD1–4; D2 tem CD5–8).
- Gabarito: `*_GB_impresso_*` (Q1–5 com colunas INGLÊS/ESPA­NHOL; itens “Anulado” preservados no título).
- Extração (`extract_enem_pdf.py` via `uv run --with pymupdf`) produz JSON no contrato S2.1 + imagens em layout `media/`.
- Q1–5 entram como pares `language=ingles|espanhol`; Q>5 sempre `language=null`.
- Inserção **incremental** (`import-extracted-years.mjs`, `node:sqlite`): só anos pedidos; nunca rebuild; enriquecimento e anos anteriores intactos.

### [S2.4] Comandos

- `npm run localize:images` — copia imagens 2009–2023 e reescreve URLs no banco.
- `npm run extract:years -- --years 2024,2025` — baixa PDFs/gabaritos e extrai JSON+media.
- `npm run import:years -- --years 2024,2025` — importa incrementalmente no `enem.sqlite`.
- `npm run sync:database` — publica o SQLite + manifesto.

### [S2.5] Erros e limites

- Falta de página/figura no PDF → logar e deixar `files` parcial; não forçar gabarito.
- Alternativas só-imagem podem entrar com `text=null` (o app já renderiza `file`).
- Disco/local: PDFs/ZIPs em `.cache/` (gitignore); mídias versionadas em `public/media`.
- `npm run build` limpa `docs/` preservando `DEVELOPMENT_LOG.md` e `compose/`.

## [S3] Out of Scope

- Enriquecimento INEP de 2024–2025 (pipeline `enrich-inep` fica para depois).
- Alterar schema FTS/UI além de `resolveAssetUrl` e textos de ajuda.
- Reescrever `source_documents.json_text` para URLs locais.
- Rebuild completo via `build:database` ou troca da origem enem.dev para 2009–2023.
- Editor de questões, OCR, ou hosting externo de imagens.

## Tasks

- [x] T1: Contrato e spec — acceptance: documento aprovado com contratos S2.1–S2.3 (covers: S2)
- [x] T2: `localize:images` copia `public/{year}/questions/**` de 2009–2023 para o app — acceptance: 1857 URLs do banco têm arquivo local correspondente (covers: S2.2)
- [x] T3: Rewrite de `question_files.url`, `alternatives.file_url` e `questions.context` para paths relativos — acceptance: zero ocorrências de `https://enem.dev/` nesses campos; `source_documents` intactos (covers: S2.2)
- [x] T4: `resolveAssetUrl` em render/export/print — acceptance: preview e PDF usam URL absoluta resolvida; smoke de imagem local passa (covers: S2.2; depends: T3)
- [x] T5: Extrator de PDF 2024–2025 (texto, alternativas, imagens, gabarito) no contrato enem.dev — acceptance: JSON por questão validado (covers: S2.3)
- [x] T6: Importador incremental 2024–2025 em `enem.sqlite` — acceptance: +2 provas, ~180 questões/ano, FTS indexado, `PRAGMA integrity_check=ok`, anos 2009–2023 e enriquecimento inalterados (covers: S2.1, S2.3; depends: T5)
- [x] T7: Testes (localize idempotente, resolveAssetUrl, import sample) — acceptance: `npm test` verde (covers: S2.2, S2.3)
- [x] T8: Sync + docs de operação — acceptance: `sync:database` e README/runbook atualizados (covers: S2.4; depends: T2–T6)
