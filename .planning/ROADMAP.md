# Roadmap — Montador de Provas ENEM

Este roadmap transforma as decisões iniciais em fases executáveis. Cada fase deve terminar com uma entrega observável e um registro de evidências no `docs/DEVELOPMENT_LOG.md`. As fases respeitam a fronteira do app em `montador-enem`; `enem-api` não é uma dependência nem alvo de alteração.

## Visão geral

| Fase | Entrega | Dependências | Status |
|---|---|---|---|
| 1 | Fundação independente e contrato de dados | `enem.sqlite` existente; decisões deste documento | Validada |
| 2 | Coletor CLI e manutenção da base | Fase 1 | Implementada; coleta real controlada pendente |
| 3 | SQLite WASM e busca FTS5 | Fases 1 e 2 | Validada |
| 4 | Montagem de caderno e gabarito | Fase 3 | Implementada |
| 5 | Exportações, backup e endurecimento operacional | Fase 4 | Implementada |

## Fase 1: Fundação independente e contrato de dados

**Objetivo:** deixar `montador-enem` executável como app independente e documentar/validar o contrato mínimo da base canônica sem acoplamento a `enem-api`.

**Execução:**

1. Confirmar o limite do app, os comandos de desenvolvimento/build e a estrutura de entrada do Vite.
2. Definir o carregamento de assets e a fronteira de módulos entre UI, acesso SQLite e serviços locais.
3. Inspecionar o schema real de `enem.sqlite` sem substituir o arquivo; registrar tabelas, campos necessários e versão/compatibilidade do banco.
4. Definir o contrato de leitura para questões, alternativas, gabaritos, metadados e índice FTS5, conforme o schema encontrado.
5. Adicionar uma verificação de inicialização que falhe de forma legível quando a base canônica não estiver disponível ou for incompatível.

**Critérios de aceite:**

1. O app inicia e gera build dentro de `montador-enem` usando Vite, sem iniciar ou importar código de `enem-api`.
2. O app identifica `enem.sqlite` como a fonte canônica e informa claramente erro de arquivo/schema incompatível.
3. O contrato de dados documenta os campos que uma questão precisa oferecer para busca, seleção, montagem e gabarito.
4. Uma verificação automatizada ou manual reproduzível comprova que a abertura da base não altera nem duplica o banco canônico.

**Saída:** app mínimo executável, contrato de dados registrado e evidências no log de desenvolvimento.

## Fase 2: Coletor CLI e manutenção da base

**Objetivo:** criar um caminho repetível para coletar, normalizar e incorporar questões na base canônica.

**Execução:**

1. Definir a entrada do coletor CLI, seu formato de configuração e o modo de execução local.
2. Implementar ingestão com validação de campos obrigatórios e mensagens de erro acionáveis.
3. Implementar deduplicação/idempotência para que a mesma fonte não crie cópias de uma questão.
4. Atualizar tabelas de domínio e o índice FTS5 na mesma operação lógica, com relatório de inseridos, atualizados, ignorados e rejeitados.
5. Registrar a origem e a data de coleta de cada lote, quando essa informação existir na fonte.

**Critérios de aceite:**

1. Uma execução documentada do CLI processa uma entrada de exemplo e produz um resumo contável do lote.
2. Reprocessar a mesma entrada não cria duplicatas e informa o que permaneceu inalterado.
3. Registros inválidos são rejeitados sem corromper os registros válidos nem deixar a base em estado parcialmente inconsistente.
4. Após a ingestão, uma consulta FTS5 encontra o conteúdo recém-processado e o relatório identifica falhas de indexação.
5. O CLI aponta explicitamente para o `enem.sqlite` da raiz por padrão ou exige um caminho alternativo explícito, sem gravar em `enem-api`.

**Saída:** coletor CLI repetível, pipeline de validação/normalização e atualização consistente da base e do FTS5.

## Fase 3: SQLite WASM e busca FTS5

**Objetivo:** permitir que o usuário carregue a base local e encontre questões rapidamente por texto e filtros.

**Execução:**

1. Integrar SQLite WASM no app e carregar uma cópia de leitura adequada ao navegador, mantendo `enem.sqlite` como origem.
2. Implementar consultas FTS5 parametrizadas e tratamento de termos sem resultado, caracteres especiais e erros de carregamento.
3. Construir a tela de busca com jQuery e Bootstrap 5, com estado de carregamento, erro, paginação/limite e contagem de resultados.
4. Adicionar filtros baseados no contrato de dados, preservando a consulta textual como eixo principal.
5. Exibir cada resultado com os metadados necessários para decidir se a questão entra no caderno.

**Critérios de aceite:**

1. Com `enem.sqlite` disponível, o app abre a base em SQLite WASM e mostra estado de pronto sem depender de requisição à `enem-api`.
2. Uma busca por termo presente retorna questões relevantes via FTS5; um termo ausente mostra estado vazio compreensível.
3. Filtros combinados reduzem os resultados sem perder o termo pesquisado e sem executar SQL por concatenação insegura.
4. A interface permanece utilizável durante carregamento, erro e consultas sem resultado.
5. Uma verificação comprova que a tela usa a base/índice atualizado pelo coletor da Fase 2.

**Saída:** busca local funcional, observável e ancorada no índice FTS5.

## Fase 4: Montagem de caderno e gabarito

**Objetivo:** transformar resultados encontrados em uma seleção revisável e em um caderno de prova coerente.

**Execução:**

1. Permitir adicionar/remover questões da seleção sem perder os critérios de busca.
2. Exibir a seleção com numeração, enunciado resumido, metadados e gabarito separado da área de edição/revisão.
3. Permitir ordenar e revisar a composição antes de gerar a saída.
4. Validar duplicatas, questões sem alternativa/gabarito e quantidade mínima necessária para exportar.
5. Persistir um rascunho local somente se isso não conflitar com a regra de `enem.sqlite` canônico; documentar o mecanismo escolhido.

**Critérios de aceite:**

1. O usuário consegue adicionar uma questão da busca ao caderno, removê-la e confirmar a contagem atual.
2. O caderno não contém a mesma questão duas vezes e mantém uma numeração determinística após reordenação.
3. O sistema bloqueia ou sinaliza claramente questões incompletas antes da exportação.
4. O gabarito é gerado a partir das mesmas identificações do caderno e não depende de edição manual duplicada.
5. Fechar/abrir a etapa de montagem preserva o resultado conforme o mecanismo de rascunho documentado.

**Saída:** fluxo completo de seleção, revisão, ordenação e preparação de caderno/gabarito.

## Fase 5: Exportações, backup e endurecimento operacional

**Objetivo:** tornar o resultado transportável, recuperável e seguro para uso fora do ambiente de desenvolvimento.

**Execução:**

1. Implementar exportação do caderno e do gabarito em um formato imprimível e exportação estruturada para interoperabilidade.
2. Definir nomes, metadados, versão do formato e comportamento quando houver caracteres especiais ou imagens ausentes.
3. Implementar backup do `enem.sqlite` com timestamp, verificação de integridade e restauração explícita/segura.
4. Documentar como testar uma restauração sem substituir acidentalmente a base canônica em uso.
5. Executar uma verificação de ponta a ponta: coletar, indexar, buscar, montar, exportar, fazer backup e restaurar.

**Critérios de aceite:**

1. Um caderno e seu gabarito podem ser exportados e abertos fora do app mantendo identificação e ordem das questões.
2. A exportação estruturada contém os dados necessários para reprocessamento ou auditoria, incluindo identificadores e origem quando disponíveis.
3. Um backup verificável de `enem.sqlite` é criado sem sobrescrever a origem e informa tamanho, timestamp e resultado de integridade.
4. Uma restauração de teste recompõe uma cópia funcional e o FTS5 continua consultável.
5. O fluxo de ponta a ponta é reproduzível por comandos documentados e suas evidências são registradas no log.

**Saída:** pacote de exportação, rotina de backup/restauração e verificação operacional do produto.

## Regras de execução e conclusão

- Cada fase deve preservar mudanças de outras pessoas e limitar alterações ao escopo da fase.
- Antes de qualquer migração, fazer backup verificável e registrar a compatibilidade com o `enem.sqlite` existente.
- Não incluir `enem-api` no Git raiz nem introduzir dependência runtime dela.
- Uma fase só pode ser marcada como concluída quando todos os critérios de aceite tiverem evidência no `docs/DEVELOPMENT_LOG.md`.
- Se o schema real contradizer alguma hipótese deste roadmap, atualizar primeiro o contrato, o estado e o log; depois ajustar a fase afetada.

---
*Roadmap inicial criado em 18/09/2026.*
