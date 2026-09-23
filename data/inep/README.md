# Snapshots compactos dos itens do ENEM

Este diretório contém subconjuntos compactos de tabelas de itens usados pelo pipeline de enriquecimento do `enem-criador`.

## ENEM 2023 — caderno azul

Arquivo: `ITENS_PROVA_2023_AZUL.csv`

Origem semântica: tabela `ITENS_PROVA_2023.csv` do pacote oficial de Microdados do ENEM 2023, publicado pelo Inep.

Pacote oficial:
https://download.inep.gov.br/microdados/microdados_enem_2023.zip

Página de catálogo do Inep:
https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/enem

Transporte do snapshot: cópia pública processada do caderno AZUL no repositório
`hudo9921/2va_dados_educacionais`, arquivo
`gahuta/dados/processados/ITENS_PROVA_2023_AZUL.csv`, blob
`51ba97155a049d0a49ff058248eb34e4a4745d41`.

O snapshot preserva as colunas do arquivo de itens necessárias ao enriquecimento:
`CO_POSICAO`, `SG_AREA`, `CO_ITEM`, `TX_GABARITO`,
`CO_HABILIDADE`, parâmetros TRI, `TX_COR`, `CO_PROVA`,
`TP_LINGUA` e indicadores de item.

Ele não é apresentado como o pacote integral do Inep: contém somente o caderno
azul regular de 2023. O pipeline mantém o download oficial como fallback para
anos/casos não cobertos pelo snapshot.

Antes de sua incorporação, uma amostra das posições 91–110 foi cruzada com a
base da aplicação: os 20 gabaritos coincidiram e o vínculo revelou divergências
de disciplina existentes na fonte enem.dev. A associação em produção continua
exigindo limiar de precisão; questões não resolvidas permanecem sem metadado
oficial, em vez de serem classificadas à força.


## ENEM 2009–2022 — tabelas completas normalizadas

Arquivos: `ITENS_PROVA_2009.csv` até `ITENS_PROVA_2022.csv`.

Origem semântica: tabelas `ITENS_PROVA_AAAA.csv` dos respectivos pacotes oficiais de Microdados do ENEM publicados pelo Inep.

Transporte compacto: repositório público `HenriqueLindemann/analise-enem`, diretório
`src/tri_enem/data/itens/<ano>/`. O manifesto usado para conferir a
proveniência é `src/tri_enem/data/itens/manifest.json` (blob
`ce2ef5a9ba95ea9d8963643e51c5e08f1070113a`).

O manifesto informa que os CSVs foram lidos da distribuição oficial em Latin-1
e regravados em UTF-8, com separador ponto e vírgula e finais de linha LF. O
pipeline detecta esses snapshots locais e os lê como UTF-8; quando precisa
baixar diretamente do Inep, mantém a leitura Latin-1.

| Ano | SHA-256 normalizado |
| ---: | --- |
| 2009 | `39646b0adca6fe2a1ecc2964416e91052a70293364e53ed7d5b7c7340198713d` |
| 2010 | `ae70ffe310b5e9f9bfa5d8fd3a952c7977ab55018c680e638e92da86ccd75938` |
| 2011 | `13fe428f16f75c3ec0819ef15e61e8541a2aaaf8474679fe83564a517f71b4a5` |
| 2012 | `f943c4557ce78704c15620a031b95d867c0781559935d5060b311ab2f8698a72` |
| 2013 | `892aaa9127821d4f34a6a6f90771c7f84df431b4c2649433bdbd7967a86c41fc` |
| 2014 | `7db923724d32c11a6b75a54090e55b33da2843649d365db9e56ab6cccd5aeff7` |
| 2015 | `c294729aa33d931dba12953c110a564857db3f30fb44ba9540e42b9729d99eeb` |
| 2016 | `43e6006cd2af0ceb443e7ea036d0853319b8eefdc8b66581b16919b27fb5f2d7` |
| 2017 | `29c093322011ac235744334166f0e30e109dc4b8b87b3f0b15f422572c8166f0` |
| 2018 | `330d2a26ba963ba84519f4c0783a06298e17818bd6069f5ad7dcef21319184c5` |
| 2019 | `2c7af4a732917d896944860f8c4a04fccb62094eea74fa0c3a343a4e4cc8ccc5` |
| 2020 | `8dd629c9524df5f72f1080653ad3eac697ddf2ffe21ebe2bb22d729cf0b69345` |
| 2021 | `0bf2e0bb2c4faa4fd2bb60835523864d1333e759d81d084a600c38736773bf26` |
| 2022 | `200c8f27f4e400c8a60d3b6a0842e411de208264ba06b09fa1bfc10ace4e8693` |

## ENEM 2024–2025 — tabelas completas normalizadas

Arquivos: `ITENS_PROVA_2024.csv`, `ITENS_PROVA_2025.csv`.

Origem semântica: tabelas `ITENS_PROVA_AAAA.csv` dos pacotes oficiais de
Microdados do ENEM 2024 e 2025 publicados pelo Inep.

- https://download.inep.gov.br/microdados/microdados_enem_2024.zip
- https://download.inep.gov.br/microdados/microdados_enem_2025.zip

Entrada nos ZIPs:

- `microdados_enem_2024/DADOS/ITENS_PROVA_2024.csv`
- `microdados_enem_2025/DADOS/ITENS_PROVA_2025.csv`

Transporte: extração por range HTTP apenas da entrada CSV (o pacote integral
não é copiado para o repositório). O CSV oficial é Latin-1 com separador ponto
e vírgula; os snapshots foram regravados em UTF-8 com finais de linha LF.

| Ano | SHA-256 normalizado |
| ---: | --- |
| 2024 | `c11e5e23f96dcb607a3018b7e24c48d3f14668f02b2007346ee22545c5e7b95a` |
| 2025 | `dc23be5cccf827d9d205c4aaf81b969a1b97e468cf002e899ad2451969e7d1ee` |

O pipeline detecta snapshots em `data/inep/` e os lê como UTF-8.

Esses arquivos são usados primeiro para auditoria em `--dry-run`. Um ano só é
classificado automaticamente como `safe` quando atinge a cobertura mínima
configurada e todos os vínculos aceitos já satisfazem o limiar de precisão do
casamento por gabarito + posição. Anos abaixo do limiar ficam em `review` e
não devem ser aplicados em lote sem investigação.
