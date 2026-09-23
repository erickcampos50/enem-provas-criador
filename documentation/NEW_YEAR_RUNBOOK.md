# Runbook — adicionar um novo ano do ENEM (2026+)

Procedimento completo usado para ENEM 2024 e 2025, pronto para ser repetido quando as provas de 2026 (e seguintes) forem publicadas.

A API pública enem.dev **não** cobre anos novos (em 2026 ela ainda parava em 2023). Por isso a extração sai dos **PDFs oficiais do INEP** e o enriquecimento sai dos **microdados** (`ITENS_PROVA`).

Fluxo resumido:

1. Inspecionar inventário de PDFs do ano
2. Baixar caderno Azul + gabaritos
3. Extrair questões + imagens → JSON no contrato enem.dev
4. Importar incrementalmente no `enem.sqlite`
5. Extrair `ITENS_PROVA_<ano>.csv` dos microdados
6. Auditar e aplicar o enriquecimento INEP
7. Testar, sincronizar e publicar

Nunca use `npm run build:database` para “só adicionar um ano”: ele reconstrói o banco inteiro a partir da API e **apaga** o enriquecimento INEP.

---

## 1. Pré-requisitos

A partir de `montador-enem/`:

```bash
node --version    # >= 20.19 (o importador usa node:sqlite, Node 22+)
npm ci
export PATH="$HOME/.local/bin:$PATH"   # sqlite3 CLI, se instalado sem sudo
```

Ferramentas usadas na extração de PDF:

- `uv` (https://docs.astral.sh/uv/) — roda PyMuPDF sem instalar no sistema
- `curl` e `unzip`

Cache de trabalho (tudo em `.cache/`, fora do Git):

| Pasta | Conteúdo |
|---|---|
| `.cache/enem-pdf/` | PDFs oficiais baixados |
| `.cache/enem-extract/<ano>/` | `exam.json`, `questions.json`, `media/` |
| `.cache/enem-microdados/` | ZIPs/CSVs dos microdados (opcional) |

---

## 2. Inventário dos PDFs oficiais

Base:

```text
https://download.inep.gov.br/enem/provas_e_gabaritos/
```

Padrão de nomes (confirmado em 2024 e 2025):

| Arquivo | Conteúdo |
|---|---|
| `<ano>_PV_impresso_D1_CD1.pdf` … `D1_CD4.pdf` | 1º dia, cadernos 1–4 (cores) |
| `<ano>_PV_impresso_D2_CD5.pdf` … `D2_CD8.pdf` | 2º dia, cadernos 5–8 |
| `<ano>_GB_impresso_D1_CD1.pdf` … | gabaritos do 1º dia |
| `<ano>_GB_impresso_D2_CD5.pdf` … | gabaritos do 2º dia |

**Não existe `D2_CD1`.** O 2º dia começa em CD5.

Cores (capa do caderno) — 2024: Azul 1 / Amarelo 2 / Branco 3 / Rosa 4; 2º dia Azul 7. Em 2025 a 4ª cor do 1º dia virou Verde.

**Caderno canônico da base (numerado 1–180 como a API):**

- 1º dia: **`D1_CD1` (Azul)** — questões 1–90 (LC + CH)
- 2º dia: **`D2_CD7` (Azul)** — questões 91–135 (CN) e 136–180 (MT)

Descubra o CD do Azul do 2º dia pela capa (`Azul 7` em 2024/2025). Se mudar, ajuste `CANONICAL_BOOKS` em `scripts/extract-enem-years.mjs`.

Probes úteis antes de baixar tudo:

```bash
for name in ${ANO}_PV_impresso_D1_CD1 ${ANO}_PV_impresso_D2_CD7 \
            ${ANO}_GB_impresso_D1_CD1 ${ANO}_GB_impresso_D2_CD7; do
  curl -k -sS -o /dev/null -w "%{http_code} $name\n" -L --max-time 15 -r 0-0 \
    "https://download.inep.gov.br/enem/provas_e_gabaritos/${name}.pdf"
done
```

`206`/`200` = existe. O host do INEP às vezes falha TLS: o pipeline já cai para `curl --insecure` **só** nesse host.

---

## 3. Extrair questões + imagens

```bash
cd montador-enem
npm run extract:years -- --years 2026 --verbose
```

O que o comando faz:

1. Baixa para `.cache/enem-pdf/`:
   - `2026_PV_impresso_D1_CD1.pdf`
   - `2026_PV_impresso_D2_CD7.pdf`
   - `2026_GB_impresso_D1_CD1.pdf`
   - `2026_GB_impresso_D2_CD7.pdf`
2. Executa `scripts/extract_enem_pdf.py` via `uv run --with pymupdf`.
3. Gera em `.cache/enem-extract/2026/`:
   - `exam.json` — resumo da prova no formato enem.dev
   - `questions.json` — lista de questões no formato enem.dev
   - `2026/questions/<n>[-ingles|-espanhol]/img-*.ext` — figuras extraídas

### Contrato gerado (espelha enem.dev)

```json
{
  "title": "Questão 10 - ENEM 2026",
  "index": 10,
  "year": 2026,
  "language": null,
  "discipline": "linguagens",
  "context": "… Markdown …",
  "files": ["asset:media/2026/questions/10/img-6-0.png"],
  "correctAlternative": "C",
  "alternativesIntroduction": "…",
  "alternatives": [
    { "letter": "A", "text": "…", "file": null, "isCorrect": false }
  ]
}
```

Regras que o extrator já implementa (confira no JSON):

- Q1–5 viram **dois** registros (`language: "ingles"` e `"espanhol"`), a partir dos blocos “opção inglês” / “opção espanhol”.
- Q>5 sempre `language: null` (em 2025 faltava o header “Questões de 06 a 45” e a língua grudava — o extrator força a limpeza).
- Itens **Anulados** (gabarito oficial): `title` com sufixo ` (Anulado)` e `correctAlternative: ""`.
- Imagens só de página/dia corretos; ignora marcas d’água de página cheia.

Amostra rápida de sanidade:

```bash
python3 - <<'PY'
import json
from pathlib import Path
qs = json.loads(Path('../.cache/enem-extract/2026/questions.json').read_text())
print(len(qs), 'questões')
print(sorted({(q['index'], q['language']) for q in qs if q['index'] <= 6}))
print('voided', [q['title'] for q in qs if 'Anulado' in q['title']])
print('com imagem', sum(1 for q in qs if q['files']))
PY
```

Esperado: **185** questões (175 `language=null` + 5 inglês + 5 espanhol), índices 1–180.

---

## 4. Importar no `enem.sqlite` (incremental)

```bash
cd montador-enem
npm run import:years -- --years 2026 --verbose
```

- Grava **só** o(s) ano(s) pedidos em `exams`, `questions`, `alternatives`, `question_files`, `exam_questions`, `source_documents` + FTS5.
- Copia as imagens para `public/media/2026/...`.
- Recusa se o ano já existir (para reimportar, apague o ano e rode de novo).
- `PRAGMA integrity_check` antes do COMMIT.

Validar:

```bash
sqlite3 ../enem.sqlite "SELECT year, COUNT(*) FROM questions GROUP BY year ORDER BY year;"
sqlite3 ../enem.sqlite "PRAGMA integrity_check;"
```

---

## 5. Microdados / `ITENS_PROVA`

Fonte:

```text
https://download.inep.gov.br/microdados/microdados_enem_<ano>.zip
```

O ZIP é grande (centenas de MB a ~1 GB). Em vez de baixar tudo, extraia **só** a entrada  
`microdados_enem_<ano>/DADOS/ITENS_PROVA_<ano>.csv` com range HTTP:

```bash
python3 - <<'PY'
import struct, urllib.request, ssl, re, zlib
from pathlib import Path

ctx = ssl._create_unverified_context()
year = 2026
url = f'https://download.inep.gov.br/microdados/microdados_enem_{year}.zip'
dest = Path(f'data/inep/ITENS_PROVA_{year}.csv')

def fetch_range(url, start, end):
    req = urllib.request.Request(url, headers={'Range': f'bytes={start}-{end}', 'User-Agent': 'montador-enem/1.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=120) as r:
        return r.read()

def content_length(url):
    req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': 'montador-enem/1.0'})
    with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
        return int(r.headers['Content-Length'])

size = content_length(url)
tail = fetch_range(url, size - 131072, size - 1)
idx = tail.rfind(b'PK\x05\x06')
_, _, _, _, n_total, cd_size, cd_offset, _ = struct.unpack_from('<IHHHHIIH', tail, idx)
cd = fetch_range(url, cd_offset, cd_offset + cd_size - 1)

# localiza a entrada no central directory
i = 0
entry = None
while i + 46 <= len(cd):
    if cd[i:i+4] != b'PK\x01\x02':
        break
    (_, _, _, flag, method, _, _, _, csize, usize, nlen, elen, clen, _, _, _, local_off) = struct.unpack_from('<IHHHHHHIIIHHHHHII', cd, i)
    name = cd[i+46:i+46+nlen].decode('utf-8', 'replace')
    if re.search(rf'ITENS_PROVA_{year}\.csv$', name, re.I):
        entry = dict(method=method, csize=csize, local_off=local_off, name=name)
        break
    i += 46 + nlen + elen + clen

lh = fetch_range(url, entry['local_off'], entry['local_off'] + 29)
nlen, elen = struct.unpack_from('<HH', lh, 26)
data_start = entry['local_off'] + 30 + nlen + elen
raw = fetch_range(url, data_start, data_start + entry['csize'] - 1)
payload = raw if entry['method'] == 0 else zlib.decompress(raw, -15)
dest.parent.mkdir(parents=True, exist_ok=True)
# oficial é Latin-1 + ';'; snapshot do repo é UTF-8 + LF
text = payload.decode('latin1').replace('\r\n', '\n').replace('\r', '\n')
dest.write_text(text, encoding='utf-8', newline='\n')
print('wrote', dest, dest.stat().st_size, 'bytes')
PY
```

Depois registre origem + SHA-256 em `data/inep/README.md` (padrão dos anos anteriores):

```bash
sha256sum data/inep/ITENS_PROVA_2026.csv
```

Colunas exigidas pelo pipeline:  
`CO_POSICAO;SG_AREA;CO_ITEM;TX_GABARITO;CO_HABILIDADE;…;TX_COR;CO_PROVA;TP_LINGUA;…`

---

## 6. Enriquecimento INEP (mesmo fluxo de 2009–2023)

O runbook completo está em [`INEP_ENRICHMENT_RUNBOOK.md`](./INEP_ENRICHMENT_RUNBOOK.md). Versão curta para o ano novo:

```bash
cd montador-enem

# auditoria (não grava)
node scripts/enrich-inep.mjs --years 2026 --dry-run --safe-min-coverage 0.93 \
  --report-json ../data/inep/audit/2026.json \
  --report-md ../data/inep/audit/2026.md --verbose

# se status=safe (cobertura tipicamente > 95%, precisão 100%)
node scripts/enrich-inep.mjs --years 2026 --verbose
```

Casamento: gabarito + posição + caderno (`CO_PROVA`) + área + língua, com offsets.  
Não confia na disciplina da fonte.

**Não resolvidas esperadas:** questões **(Anulado)** (sem gabarito para casar). Não force metadado.

Referência 2024/2025: 99,5% e 98,4% de cobertura, precisão 100%, 4 anuladas sem enriquecer.

Depois:

```bash
npm test
npm run sync:database
```

Amplie o default de anos em `.github/workflows/enrich-database.yml` para incluir 2026.

---

## 7. Imagens (esquema `asset:`)

Anos novos já saem do extrator com chaves  
`asset:media/<ano>/questions/<index>[-lang]/<arquivo>`  
e arquivos em `public/media/...`.

Resolução em runtime (`src/assets.js`):

1. `VITE_ASSET_BASE_URL` (CDN/espelho), se definido;
2. `BASE_URL` do Vite (`/enem-provas-criador/` no GitHub Pages);
3. fallback `https://erickcampos50.github.io/enem-provas-criador/`.

Se um dia for republicar as imagens 2009–2023 a partir do `yunger7/enem-api`:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/yunger7/enem-api.git /tmp/enem-api-src
git -C /tmp/enem-api-src sparse-checkout set public
npm run localize:images -- --source /tmp/enem-api-src/public --verbose
```

---

## 8. Publicar

```bash
VITE_BASE_PATH=/enem-provas-criador/ npm run build
```

Commit sugerido (por etapa, para rollback fácil):

1. `feat: extrai ENEM <ano> dos PDFs oficiais`
2. `data: importa ENEM <ano> no banco canônico`
3. `data: adiciona ITENS_PROVA_<ano> e enriquece com microdados INEP`

Depois do push em `main`, rode **Deploy Montador ENEM to GitHub Pages** se o deploy automático não disparar.

Checklist (igual ao runbook INEP + extras deste fluxo):

- [ ] Inventário de PDFs confirmado (D1_CD1 + D2_CD7 + gabaritos)
- [ ] `questions.json` com 185 questões e línguas Q1–5 corretas
- [ ] Anulados sinalizados e sem gabarito falso
- [ ] `import:years` ok + `integrity_check`
- [ ] `ITENS_PROVA_<ano>.csv` versionado + hash no `data/inep/README.md`
- [ ] Auditoria `safe` antes de aplicar o enriquecimento
- [ ] `npm test` verde
- [ ] `npm run sync:database` + SHA no manifesto
- [ ] Ano novo no default do workflow `enrich-database.yml`
- [ ] Deploy e conferência online

---

## 9. Problemas conhecidos

| Sintoma | Causa provável | Ação |
|---|---|---|
| 404 em `D2_CD1` | 2º dia usa CD5–CD8 | Baixar `D2_CD7` (Azul) |
| Língua “espanhol” em Q6+ | header de seção ausente no PDF | extrator atual já força `language=null` para Q>5; não remova esse trecho |
| Imagens faltando em parte do dia | bug de `current_language` no scan de páginas | confira `extract_enem_pdf.py` (dois passes com a mesma regra Q>5) |
| `build:database` limpou o enriquecimento | rebuild do zero | restaurar via Git e usar `import:years` |
| Filtro de disciplina duplicado | labels com NBSP (`U+00A0`) | `import:years` normaliza; no SQL use `GROUP BY value` |
| `Cache.put()` derrubando o app | browser/Vite dev | já é best-effort em `cache.js`; não deve bloquear startup |
| Download dos microdados muito lento | ZIP completo | use o script de range HTTP da seção 5 |
| TLS do `download.inep.gov.br` | certificado do host | `curl --insecure` só nesse host (o `enrich-inep` já faz fallback) |

---

## 10. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `montador-enem/scripts/extract-enem-years.mjs` | baixa PDFs e orquestra a extração |
| `montador-enem/scripts/extract_enem_pdf.py` | PDF → JSON + imagens (PyMuPDF) |
| `montador-enem/scripts/import-extracted-years.mjs` | importa ano no SQLite (incremental) |
| `montador-enem/scripts/localize-question-images.mjs` | imagens 2009–2023 + rewrite `asset:` |
| `montador-enem/scripts/enrich-inep.mjs` | auditoria/aplicação do enriquecimento |
| `montador-enem/src/assets.js` | esquema `asset:` multi-host |
| `data/inep/ITENS_PROVA_<ano>.csv` | snapshot de itens (UTF-8) |
| `documentation/INEP_ENRICHMENT_RUNBOOK.md` | critérios detalhados do enriquecimento |

---
*Runbook criado em 23/09/2026 a partir da entrega de ENEM 2024–2025.*
