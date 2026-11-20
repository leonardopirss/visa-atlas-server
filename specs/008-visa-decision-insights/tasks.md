# Tasks: Indicadores de decisão e requisitos de vistos

**Inputs:** `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`,
`quickstart.md`, Constituição e OpenAPI canônico.

**Formato:** `[ID] [P?] [US?] Descrição com caminho exato`.

**Regra de conclusão:** marcar `[x]` somente após implementação, testes da tarefa
e evidência verificável. Tarefas `[P]` não podem editar o mesmo arquivo. Testes
devem ser escritos e observados em RED antes da implementação correspondente.

## Phase 1 — Discovery, semântica e admission gates (bloqueante)

- [x] VDI-T001 Inventariar no OpenAPI, Prisma, presenters, filtros, comparador e
      adapters todos os pontos impactados por novos `MetricType`; registrar a
      matriz em `specs/008-visa-decision-insights/research.md`.
- [x] VDI-T002 [P] [US1] Pesquisar fontes primárias candidatas para decisões
      favoráveis, desfavoráveis e total de decisões no recorte BRA/WORK e
      BRA/STUDY; preencher um admission record por fonte em
      `specs/008-visa-decision-insights/research.md`.
- [x] VDI-T003 [P] [US2] Pesquisar fontes primárias de mediana/P90/meta de
      processamento e inventário pendente; distinguir dias úteis/corridos,
      dado observado/estimado e scope em
      `specs/008-visa-decision-insights/research.md`.
- [x] VDI-T004 [P] [US3] Pesquisar páginas oficiais de taxa, fundos, dependentes,
      trabalho do cônjuge, renovação e residência para modalidades já
      verificadas; registrar vigência, condição e licença em
      `specs/008-visa-decision-insights/research.md`.
- [x] VDI-T005 [US1] Fechar a definição de numerador, denominador, população,
      período, release, metodologia, arredondamento e regra de rejeição para
      `APPROVAL_RATE` e `REFUSAL_RATE` no `research.md`.
- [x] VDI-T006 Fechar a modelagem de `PopulationScope`, inclusive backfill das
      observações atuais e comportamento de filtros quando o dado for nacional,
      no `data-model.md` e `plan.md`.
- [x] VDI-T007 Revisar o delta em
      `specs/008-visa-decision-insights/contracts/openapi-visa-insights-delta.yaml`
      entre responsáveis FE/BE e registrar decisão em
      `../visa-atlas-client/specs/001-shared-api-contract/decision.md`.
- [x] VDI-T008 Documentar fontes admitidas/rejeitadas, licença, atribuição,
      fingerprint estrutural e política de atualização em `docs/data-sources.md`;
      fontes sem evidência suficiente ficam fora das fases de implementação.

**Checkpoint:** VDI-T001–VDI-T008 aprovadas. Não criar migration, enum nem DTO
antes do fechamento de taxonomia, scope, derivação e pelo menos uma fonte para o
MVP. US2/US3 podem permanecer como cobertura parcial sem bloquear US1.

## Phase 2 — Contrato compartilhado e fundação de dados

### Tests first

- [x] VDI-T009 [P] Adicionar testes RED de contrato para novos `MetricType`,
      `PopulationScope`, derivação, requisitos e retrocompatibilidade em
      `test/contract/public-api.spec.ts`.
- [x] VDI-T010 [P] Adicionar testes RED de parsing/validação dos payloads novos
      em `../visa-atlas-client/apps/web/src/services/api/validation.test.ts`.
- [x] VDI-T011 [P] Adicionar testes RED de migration/backfill, constraints de
      derivação e intervalos de requisitos em `test/integration/`.

### Implementation

- [x] VDI-T012 Atualizar de forma aditiva o OpenAPI canônico em
      `../visa-atlas-client/specs/001-shared-api-contract/contracts/openapi.yaml`
      com a taxonomia aprovada, scope, derivação e requisitos.
- [x] VDI-T013 Sincronizar `contracts/openapi.yaml`, validar os dois contratos e
      regenerar `../visa-atlas-client/packages/contracts/src/generated/api.ts`.
- [x] VDI-T014 Atualizar `prisma/schema.prisma` com enums, scope,
      `MetricDerivation`, `VisaProgramRequirement`, relações, uniques e índices.
- [x] VDI-T015 Criar migration aditiva e backfill seguro em
      `prisma/migrations/20261116120000_add_visa_decision_insights/migration.sql`,
      sem reclassificar observações existentes.
- [x] VDI-T016 Atualizar tipos públicos, DTOs, presenters e serializers em
      `src/common/` e `src/modules/statistics/`, mantendo campos novos opcionais
      para consumidores anteriores.
- [x] VDI-T017 Atualizar fixtures/builders sintéticos no backend em
      `test/helpers/` e no frontend em `../visa-atlas-client/apps/web/src/test/`,
      rotulando-os como teste e cobrindo scopes distintos.
- [x] VDI-T018 Executar gates de contrato, migration, geração e typecheck nos
      dois repositórios; registrar resultados no `quickstart.md`.

**Checkpoint:** contrato e banco aceitam dados antigos e novos; nenhum dado
nacional é rotulado como BRA; endpoints existentes continuam compatíveis.

## Phase 3 — US1: resultados de decisão e taxas auditáveis (P1) 🎯 MVP

**Goal:** publicar decisões brutas e taxas derivadas somente para pares
compatíveis, com fórmula e operandos visíveis.

**Independent Test:** uma release sintética compatível publica contagens e taxa;
qualquer divergência de dimensão ou denominador inválido impede a publicação sem
afetar o snapshot anterior.

### Tests first

- [x] VDI-T019 [P] [US1] Criar testes RED de tabela para compatibilidade,
      denominador zero/nulo, numerador zero/maior, basis points e arredondamento
      em `src/modules/statistics/services/metric-derivation.service.spec.ts`.
- [x] VDI-T020 [P] [US1] Criar testes RED do validator para evento, população,
      unidade, período, supressão e source category em
      `src/modules/ingestion/validation/decision-insight.validator.spec.ts`.
- [x] VDI-T021 [P] [US1] Criar teste de integração RED para staging,
      derivação transacional, linhagem, publicação, idempotência, rejeição e
      preservação do snapshot em `test/integration/decision-insights.spec.ts`.
- [x] VDI-T022 [P] [US1] Criar testes frontend RED para formatação percentual,
      operandos, fórmula, zero, ausência, status e aviso interpretativo em
      `../visa-atlas-client/apps/web/src/features/country-detail/__tests__/`.
- [x] VDI-T023 [P] [US1] Criar cenário Playwright real RED de detalhe,
      histórico e comparação da taxa em
      `../visa-atlas-client/apps/web/tests/real-e2e/visa-insights.spec.ts`.

### Implementation

- [x] VDI-T024 [US1] Implementar regra pura de compatibilidade e cálculo em
      `src/modules/statistics/services/metric-derivation.service.ts`, usando
      aritmética inteira determinística.
- [x] VDI-T025 [US1] Implementar validação compartilhada de observações de
      decisão em
      `src/modules/ingestion/validation/decision-insight.validator.ts`.
- [x] VDI-T026 [US1] Implementar reader/adapter/config para a primeira fonte
      admitida em `src/modules/ingestion/adapters/visa-insights/`, preservando
      rótulo/evento original.
- [x] VDI-T027 [US1] Integrar derivação à transação de staging/publicação do
      runner da fonte admitida em `src/modules/ingestion/`, com relatório de
      qualidade e falha fechada.
- [x] VDI-T028 [US1] Expor `populationScope` e `derivation` nos presenters e nos
      endpoints estatísticos existentes em `src/modules/statistics/` e
      `src/modules/countries/services/country-detail.service.ts`.
- [x] VDI-T029 [US1] Adicionar opções e rótulos de decisões/taxas ao filtro e às
      query keys em `../visa-atlas-client/apps/web/src/features/filters/`,
      `../visa-atlas-client/apps/web/src/app/app-state.tsx` e
      `../visa-atlas-client/apps/web/src/services/api/`.
- [x] VDI-T030 [US1] Renderizar percentual, fórmula, numerador, denominador,
      scope, período, fonte e aviso “não é chance individual” em
      `../visa-atlas-client/apps/web/src/components/ui/metric-headline.tsx` e
      `../visa-atlas-client/apps/web/src/features/country-detail/components/country-tabs.tsx`.
- [x] VDI-T031 [US1] Estender histórico e comparação para `BASIS_POINTS`, sem
      ranking nem agrupamento de períodos/scopes incompatíveis, em
      `../visa-atlas-client/apps/web/src/features/statistics/` e
      `../visa-atlas-client/apps/web/src/features/comparison/`.
- [ ] VDI-T032 [US1] Executar o quickstart do MVP, suites backend/frontend e
      Playwright real; registrar fonte, release de teste, comandos e resultados
      em `quickstart.md`.

**Checkpoint:** US1 demonstrável de ponta a ponta. Aprovação/refusa só aparece
com linhagem reconstruível; volume jamais é apresentado como probabilidade.

## Phase 4 — US2: processamento e inventário pendente (P2)

**Goal:** mostrar tempo observado, meta e backlog com definições distintas e
scope honesto.

**Independent Test:** fixtures de prazo-alvo e inventário produzem fatos com
semântica, vigência e unidades distinguíveis; scope nacional não responde como
BRA e contagem arredondada não aparece como exata.

### Tests first

- [ ] VDI-T033 [P] [US2] Criar testes RED de reader/adapter para inventário,
      scope, aproximação/arredondamento e prazo-alvo vigente em
      `src/modules/ingestion/adapters/visa-insights/`.
- [ ] VDI-T034 [P] [US2] Criar teste de integração RED para publicação de
      inventário e requisito de prazo-alvo, revisão, supressão, scope
      nacional/programa e snapshot anterior em
      `test/integration/processing-insights.spec.ts`.
- [ ] VDI-T035 [P] [US2] Criar testes frontend RED para rótulos, duração,
      arredondamento, vigência, ausência e não segmentação por cidadania em
      `../visa-atlas-client/apps/web/src/features/country-detail/__tests__/`.
- [ ] VDI-T036 [P] [US2] Adicionar cenário Playwright real RED de filtro,
      histórico e comparação em
      `../visa-atlas-client/apps/web/tests/real-e2e/visa-insights.spec.ts`.

### Implementation

- [ ] VDI-T037 [US2] Implementar config/reader/adapter das fontes admitidas para
      inventário e prazo-alvo em
      `src/modules/ingestion/adapters/visa-insights/`, com fingerprint estrutural
      e limites de entrada.
- [ ] VDI-T038 [US2] Implementar runner idempotente e publicação atômica em
      `src/modules/ingestion/`, persistindo inventário como observação e prazo
      alvo como requisito vigente da modalidade.
- [ ] VDI-T039 [US2] Resolver defaults, filtros e séries por scope nos serviços
      em `src/modules/statistics/`, sem fallback silencioso de NATIONAL para BRA.
- [ ] VDI-T040 [US2] Implementar rótulos e formatadores de prazo-alvo, unidade
      original, aproximação/arredondamento e pendente no frontend em
      `../visa-atlas-client/apps/web/src/components/ui/metric-headline.tsx`.
- [ ] VDI-T041 [US2] Atualizar filtro, detalhe, histórico e comparação no
      frontend, mantendo grupos incompatíveis separados em
      `../visa-atlas-client/apps/web/src/features/`.
- [ ] VDI-T042 [US2] Validar US2 com suites completas e Playwright real;
      registrar cobertura, limitações e freshness no `quickstart.md`.

**Checkpoint:** nenhuma meta é chamada de tempo observado e backlog não gera
previsão automática.

## Phase 5 — US3: requisitos práticos versionados (P3)

**Goal:** publicar custos, fundos e direitos oficiais por modalidade com
vigência e condição.

**Independent Test:** duas versões do mesmo requisito retornam somente a vigente
como atual, preservam histórico e exibem ausência/condição sem inferência.

### Tests first

- [ ] VDI-T043 [P] [US3] Criar testes RED de validação para dinheiro, ISO 4217,
      base, estado, condição tipada/versionada, pathway, vigência, URL, release e
      intervalos concorrentes em
      `src/modules/visa-programs/visa-program-requirements.service.spec.ts`.
- [ ] VDI-T044 [P] [US3] Criar teste de integração RED para upsert idempotente,
      nova vigência, histórico, stale e rejeição de sobreposição em
      `test/integration/visa-program-requirements.spec.ts`.
- [ ] VDI-T045 [P] [US3] Criar testes frontend RED para taxa, fundos,
      dependentes, cônjuge, renovação, residência, condições e fonte em
      `../visa-atlas-client/apps/web/src/features/country-detail/__tests__/`.
- [ ] VDI-T046 [P] [US3] Criar cenário Playwright real RED de modalidade e
      comparação de requisitos em
      `../visa-atlas-client/apps/web/tests/real-e2e/visa-insights.spec.ts`.

### Implementation

- [ ] VDI-T047 [US3] Implementar valores discriminados, condições fechadas,
      pathways, seleção vigente e histórico em
      `src/modules/visa-programs/visa-program-requirements.service.ts`.
- [ ] VDI-T048 [US3] Implementar job/config de atualização da primeira fonte
      oficial admitida em `src/modules/ingestion/`, sem publicar extração não
      revisada e com fingerprint de origem.
- [ ] VDI-T049 [US3] Integrar requisitos aos programas retornados pelo detalhe
      existente em `src/modules/visa-programs/visa-programs.service.ts` e
      `src/modules/countries/services/country-detail.service.ts`.
- [ ] VDI-T050 [US3] Implementar cards acessíveis de requisitos, condição,
      vigência, freshness e link seguro em
      `../visa-atlas-client/apps/web/src/features/country-detail/components/`.
- [ ] VDI-T051 [US3] Estender comparação por modalidade, preservando moeda/base
      e sem conversão ou vencedor, em
      `../visa-atlas-client/apps/web/src/features/comparison/components/`.
- [ ] VDI-T052 [US3] Validar US3 com suites completas e Playwright real;
      registrar páginas, datas de verificação e limitações no `quickstart.md`.

## Phase 6 — Convergência, segurança e release gate

- [ ] VDI-T053 [P] Atualizar `README.md`, `docs/data-sources.md`, runbook de
      ingestão e documentação frontend com semântica, coverage e operação.
- [ ] VDI-T054 [P] Auditar validação de URLs/textos, XSS, SSRF, limites de
      parsing, logs, PII, segredos, licenças e dependências; registrar achados
      sanitizados no `quickstart.md`.
- [ ] VDI-T055 [P] Medir queries, índices, cache/versionamento e payload do
      detalhe com requisitos; registrar baseline e qualquer otimização baseada
      em evidência no `quickstart.md`.
- [ ] VDI-T056 Revisar acessibilidade em desktop/mobile, teclado, leitor de
      tela, reduced motion, ausência e erro; atualizar testes E2E e documentação.
- [ ] VDI-T057 Executar format, lint, typecheck, unit, integração, contrato,
      migration test, build e audit no backend; registrar comandos/resultados.
- [ ] VDI-T058 Executar format, lint, typecheck, Vitest, build, audit e
      Playwright contra backend/PostgreSQL reais de teste no frontend; não
      interceptar rotas sob validação.
- [ ] VDI-T059 Confirmar sincronização byte a byte dos OpenAPI, ausência de
      placeholders/números sintéticos em produção e revisar VDI-SC-001–006.
- [ ] VDI-T060 Revisar diffs dos dois repositórios, preservar mudanças locais
      fora do escopo e marcar somente tarefas com evidência como concluídas.

## Dependencies & Execution Order

- VDI-T001–T008 bloqueiam contrato e implementação.
- VDI-T009–T018 formam a fundação e bloqueiam US1, US2 e US3.
- US1: T019–T032; US2: T033–T042; US3: T043–T052.
- Após a fundação, US2 e US3 podem avançar em paralelo com US1 somente se suas
  fontes tiverem sido admitidas e não editarem arquivos de integração comuns.
- Em cada história: testes RED → modelo/serviço → ingestão → API → frontend → E2E.
- T053–T056 dependem das histórias incluídas no release; T057/T058 bloqueiam
  T059/T060.

## Parallel Execution Notes

- Pesquisa de decisões, processamento e requisitos pode ocorrer em paralelo.
- Testes marcados `[P]` usam arquivos distintos, mas o OpenAPI, Prisma,
  `country-detail.service.ts`, `metric-headline.tsx` e o E2E consolidado são
  pontos de integração e devem ser editados serialmente.
- Fixtures podem ser criadas em paralelo por fonte, desde que sintéticas,
  rotuladas e nunca importadas pela build de produção.

## MVP Strategy

1. Fechar gates e fundação (T001–T018).
2. Implementar somente US1 (T019–T032).
3. Parar e validar contrato, linhagem, API, UI e E2E real.
4. Liberar US2 e US3 como incrementos independentes, conforme disponibilidade
   de fonte oficial adequada.

## Definition of Done

O release só é concluído quando contrato e banco são retrocompatíveis, cada taxa
é reconstruível, scopes são honestos, requisitos possuem vigência/fonte,
ausência não vira zero, testes completos passam e o E2E real está documentado.
