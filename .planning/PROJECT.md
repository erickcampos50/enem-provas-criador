# Montador de Provas ENEM

## O que é

O Montador de Provas ENEM é uma aplicação independente para pesquisar questões do ENEM em uma base local e montar cadernos de prova reutilizáveis. A aplicação principal vive em `montador-enem`; o banco `enem.sqlite` na raiz do repositório é a fonte canônica de dados, enquanto o antigo `enem-api` permanece fora do escopo e excluído do Git raiz.

O produto deve funcionar com os dados locais, sem depender de um servidor de API para executar a busca, a montagem, as exportações ou os backups.

## Valor central

Permitir que alguém encontre rapidamente questões confiáveis e transforme uma seleção em uma prova exportável, preservando a autonomia e a rastreabilidade dos dados locais.

## Requisitos

### Validados

Validados por build, testes automatizados e smoke test em Chromium headless. A coleta contra a API real permanece uma operação controlada e ainda não foi executada.

- [x] O app independente em `montador-enem` inicializa com Vite e entrega uma interface baseada em jQuery e Bootstrap 5.
- [x] O app carrega e consulta `enem.sqlite` via SQLite WASM no navegador, sem depender de `enem-api`.
- [x] Um coletor CLI importa e atualiza questões na base canônica, com validação, deduplicação e atualização do índice de busca; a execução real fica pendente de uma janela controlada.
- [x] A busca textual usa FTS5 e combina texto com filtros úteis para seleção de questões.
- [x] O usuário consegue selecionar, revisar, ordenar e montar um caderno de prova e seu gabarito.
- [x] O usuário consegue exportar o resultado em HTML, Markdown e ZIP, mantendo URLs remotas de imagens.
- [x] O projeto consegue criar e restaurar backups versionados da prova e recuperar rascunhos locais.
- [x] O histórico de desenvolvimento registra decisões, estado do Git raiz e evidências de verificação.

### Fora do escopo

- Implementar ou reativar `enem-api` — o app deve ser independente e o diretório permanece excluído do Git raiz.
- Fazer a interface depender de um backend remoto para busca ou montagem — SQLite WASM local é uma decisão estrutural do produto.
- Substituir `enem.sqlite` por múltiplas bases concorrentes sem uma decisão registrada — a base na raiz é o artefato canônico.
- Construir um editor completo de questões ou uma plataforma de aplicação/correção online — a primeira versão é focada em busca, montagem, exportação e preservação.

## Contexto

- O repositório raiz já contém um `.git` e uma separação física entre a aplicação nova (`montador-enem`) e o legado (`enem-api`).
- `enem.sqlite` já existe na raiz e deve ser preservado como fonte canônica; não deve ser recriado, movido ou alterado durante trabalhos exclusivamente documentais.
- A aplicação web será distribuída como frontend local/estático. Vite organiza o ciclo de desenvolvimento e build; jQuery atende a interação existente/pretendida; Bootstrap 5 fornece o sistema visual.
- SQLite WASM permite consultar a mesma base no cliente. O coletor CLI é o caminho controlado para ingestão e manutenção dos dados fora do navegador.
- FTS5 deve ser tratado como parte do contrato de dados: ingestão, atualização, busca, diagnóstico e backup precisam manter sua consistência.

## Restrições

- **Limite de aplicação**: todo código novo do montador deve ficar em `montador-enem` — evita acoplamento acidental ao legado.
- **Fonte de dados**: `enem.sqlite` na raiz é canônico — mantém uma referência única para o app, o coletor e os backups.
- **Execução local**: a experiência principal não pode exigir `enem-api` ou outro serviço remoto — o produto precisa continuar funcional com os artefatos locais.
- **Stack de interface**: jQuery + Bootstrap 5 + Vite — decisões já tomadas para reduzir mudança de stack durante a implementação.
- **Persistência no cliente**: SQLite WASM — a busca e a montagem devem operar com a base local carregada no navegador.
- **Rastreabilidade**: coletor, exportações e backups devem ser verificáveis — dados de prova precisam ser auditáveis e recuperáveis.
- **Colaboração**: alterações de outras pessoas devem ser preservadas — documentação não autoriza reverter, limpar ou reformatar código, banco ou API.

## Decisões-chave

| Decisão | Motivo | Resultado atual |
|---|---|---|
| App independente em `montador-enem` | Separar o produto novo do legado e permitir evolução autônoma | ✓ Build e smoke test aprovados |
| `enem-api` fora do Git raiz | O backend legado não deve ser dependência nem misturar seu histórico com o app | ✓ Regra já refletida no `.gitignore` |
| jQuery + Bootstrap 5 + Vite | Stack objetiva para interface, componentes e ciclo de build | ✓ Implementado e empacotado |
| SQLite WASM no navegador | Busca e montagem locais, sem API obrigatória | ✓ Worker e smoke test aprovados |
| `enem.sqlite` na raiz como base canônica | Um único artefato de dados compartilhado pelo app, coletor e backup | ✓ Arquivo existente no início do planejamento |
| Coletor CLI como caminho de ingestão | Separar aquisição/normalização de dados da interface e tornar a atualização repetível | ✓ Implementado; coleta real controlada pendente |
| FTS5 para busca | Busca textual rápida e estruturada sobre a base local | ✓ Busca no Worker validada |
| Exportações e backup como capacidades de primeira classe | Tornar a prova utilizável fora do navegador e reduzir risco de perda de dados | ✓ ZIP, HTML, Markdown e JSON validados |

## Evolução

Este documento é o contexto vivo do projeto e deve ser atualizado nas transições de fase e nos marcos.

Após cada fase:

1. mover para **Validados** os requisitos comprovados por uso e evidência;
2. registrar em **Fora do escopo** requisitos rejeitados ou adiados, com motivo;
3. adicionar requisitos novos em **Ativos** somente quando fizerem parte do próximo incremento;
4. registrar decisões e seus resultados;
5. confirmar se a descrição e o valor central continuam corretos.

Após cada marco, revisar também os limites de `montador-enem`, `enem-api`, `enem.sqlite`, exportações e backup.

---
*Última atualização: 18/09/2026, após a validação final da implementação inicial.*
