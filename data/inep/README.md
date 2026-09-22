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
