# Estado do Projeto — Montador de Provas ENEM

## Referência do projeto

Consulte [.planning/PROJECT.md](/home/erick/enem-provas-criador/.planning/PROJECT.md) para o contexto vivo e as decisões de arquitetura.

**Valor central:** encontrar rapidamente questões confiáveis e transformá-las em uma prova exportável, com dados locais rastreáveis.

**Foco atual:** primeira implementação independente concluída e validada; próximas alterações podem ser incrementais.

## Situação atual

- **Marco:** fundação implementada, build e fluxo principal validados em navegador headless.
- **Fase ativa:** manutenção incremental; nenhuma fase bloqueia o uso da primeira versão.
- **Status:** implementação inicial concluída com testes automatizados e smoke test de navegador.
- **Progresso:** 5/5 áreas implementadas; a coleta contra API real permanece uma operação controlada futura.
- **Última atividade:** 18/09/2026 — paginação SQLite otimizada com materialização da página antes de snippets e imagens; troca validada em aproximadamente 61 ms.
- **Próxima ação recomendada:** executar uma coleta real em janela controlada, usando `npm run build:database`, somente quando houver autorização para atualizar o banco canônico.

## Decisões vigentes

1. O app novo é independente e fica em `montador-enem`.
2. `enem-api` não faz parte do produto novo e permanece excluída do Git raiz.
3. A interface usa jQuery, Bootstrap 5 e Vite.
4. SQLite WASM é a camada de consulta no navegador.
5. `enem.sqlite` na raiz é o banco canônico compartilhado por app, coletor e backup.
6. A ingestão/atualização passa por um coletor CLI.
7. A busca textual usa FTS5.
8. Exportações e backup fazem parte do escopo inicial, não são tarefas pós-MVP.

## Guardrails de colaboração

- Esta documentação não autoriza alterar, mover, reformatar ou reverter `enem.sqlite`, `enem-api`, `montador-enem` ou `package.json` de outra pessoa.
- O `.gitignore` raiz já exclui `/enem-api/`; preservar essa regra.
- O banco existente deve ser tratado como artefato de dados a preservar. Qualquer migração precisa de backup, verificação de integridade e registro no log.
- O estado do Git pode conter mudanças não relacionadas. Verificar `git status` antes de cada alteração e não fazer limpeza ampla.

## Mapa de fases

| Fase | Nome | Status | Evidência esperada |
|---|---|---|---|
| 1 | Fundação independente e contrato de dados | Validada | app isolado, contrato codificado e build aprovado |
| 2 | Coletor CLI e manutenção da base | Implementada | coletor, validações e testes simulados; coleta real controlada pendente |
| 3 | SQLite WASM e busca FTS5 | Validada | worker, banco no navegador, filtros e busca confirmados no smoke test |
| 4 | Montagem de caderno e gabarito | Implementada | seleção, ordenação, pontuação e variantes codificadas |
| 5 | Exportações, backup e endurecimento operacional | Implementada | HTML/Markdown/ZIP, backup JSON e build estático validados |

## Bloqueios e riscos conhecidos

- O schema efetivo de `enem.sqlite` foi inspecionado e corresponde ao contrato usado pelo worker/coletor; há 7 questões com quatro alternativas e uma posição duplicada em `exam_questions`, ambos tratados pelo código.
- A coleta real da API não foi executada nesta rodada para preservar a base canônica; o CLI gera banco temporário, valida integridade/FTS5 e substitui atomicamente somente após sucesso.
- Imagens continuam dependentes das URLs remotas, como definido no escopo; o banco não incorpora os arquivos de imagem.
- Como o banco e diretórios de app aparecem como arquivos não rastreados no estado inicial, mudanças de colaboração devem ser identificadas por arquivo antes de qualquer commit.

## Histórico de estado

| Data | Evento | Impacto |
|---|---|---|
| 18/09/2026 | Documentação inicial criada | Escopo, decisões, roadmap de cinco fases e guardrails registrados |
| 18/09/2026 | Implementação e validação final | App independente, coletor, SQLite WASM, montagem, exportação e backup implementados; testes e smoke browser aprovados |
| 18/09/2026 | Impressão monocromática e paginação | Folha de respostas compacta com identificação do aluno, paleta em tons de cinza e rodapé de páginas validada no smoke test |
| 18/09/2026 | Prévia textual da biblioteca | Snippets do FTS5, limpeza de Markdown e cards com três linhas mínimas validados no smoke test |
| 18/09/2026 | Paginação SQLite otimizada | CTE materializada, snippets pós-paginação, proteção contra respostas fora de ordem e troca de página em aproximadamente 61 ms |

---
*Última atualização: 18/09/2026, após a validação final da implementação inicial.*
