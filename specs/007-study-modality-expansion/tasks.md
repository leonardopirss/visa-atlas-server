# Tasks: Modalidade Estudo com fontes oficiais

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Organization**: Fundação compartilhada, depois histórias sequenciais Europa → Reino Unido → Canadá. Testes são escritos antes da implementação em cada história.

## Phase 1: Setup e contrato compartilhado

- [x] T001 [P] Espelhar os artefatos Spec Kit relevantes em `../visa-atlas-client/specs/007-study-modality-expansion/`
- [x] T002 Atualizar o OpenAPI canônico em `../visa-atlas-client/specs/001-shared-api-contract/contracts/openapi.yaml` com `STUDY`
- [x] T003 Sincronizar `contracts/openapi.yaml` e regenerar `../visa-atlas-client/packages/contracts/src/generated/api.ts`
- [x] T004 [P] Adicionar testes de contrato WORK/STUDY/inválido em `test/contract/public-api.spec.ts`
- [x] T005 [P] Adicionar testes de validação do contrato no frontend em `../visa-atlas-client/apps/web/src/services/api/`

## Phase 2: Fundação de finalidade

- [x] T006 Adicionar `STUDY` ao Prisma e migration em `prisma/schema.prisma` e `prisma/migrations/`
- [x] T007 Atualizar DTOs, tipos públicos, defaults e serviços para finalidade tipada em `src/common/` e `src/modules/statistics/`
- [x] T008 Atualizar helpers/seeds de teste para a dimensão Estudo em `test/helpers/database.ts`
- [x] T009 [P] Atualizar `FilterState`, validação de payload e query keys no frontend
- [x] T010 Implementar seletor acessível Trabalho/Estudo e transição atômica de filtros no frontend
- [x] T011 Rodar gates de contrato e tipos nos dois repositórios antes da ingestão regional

## Phase 3: User Story 1 — Europa (P1) 🎯 MVP

**Goal**: Publicar e explorar `BRA/STUDY` para primeiras autorizações de residência europeias por educação.

**Independent Test**: Fixture Eurostat `EDUC` publicada, rotas e frontend consultados com `purpose=STUDY`, sem regressão de `WORK`.

### Tests first

- [x] T012 [P] [US1] Adicionar testes unitários RED para `EDUC`, unidade e finalidade no adaptador Eurostat
- [x] T013 [P] [US1] Adicionar teste de integração RED para staging, publicação, idempotência e isolamento WORK/STUDY
- [x] T014 [P] [US1] Adicionar testes frontend RED para troca de finalidade, mapa, detalhe e histórico
- [x] T015 [P] [US1] Adicionar cenário Playwright real RED para Europa/Estudo

### Implementation

- [x] T016 [US1] Generalizar config e adapter Eurostat por categoria de finalidade
- [x] T017 [US1] Adicionar fetch e runner Eurostat de Estudo com dataset/release auditáveis
- [x] T018 [US1] Sincronizar referência `VisaPurpose.STUDY` e preservar publicação atômica
- [x] T019 [US1] Implementar rótulos, defaults e cobertura europeia de Estudo no frontend
- [x] T020 [US1] Validar quickstart Europa e todos os gates dos dois repositórios

**Checkpoint**: Europa pronta e demonstrável independentemente; não iniciar P2 antes de T020.

## Phase 4: User Story 2 — Reino Unido (P2)

**Goal**: Publicar o evento oficial de estudo aprovado do Home Office sem chamá-lo de concessão quando for aplicação.

### Admission gate e tests first

- [x] T021 [US2] Fechar tabela, worksheet, evento, período, Brasil e licença no `research.md`
- [x] T022 [P] [US2] Criar fixture estrutural e testes RED de reader/adapter Home Office Estudo
- [x] T023 [P] [US2] Criar teste de integração RED para falha fechada e preservação do snapshot
- [x] T024 [P] [US2] Criar testes frontend/E2E RED para Reino Unido/Estudo

### Implementation

- [x] T025 [US2] Implementar config, reference data e reader/adapter Home Office Estudo
- [x] T026 [US2] Implementar runner e publicação com métrica correspondente ao evento aprovado
- [x] T027 [US2] Implementar rótulos e cobertura britânica no frontend
- [x] T028 [US2] Validar quickstart Reino Unido e gates completos

**Checkpoint**: Europa e Reino Unido funcionam de forma independente e preservam semântica própria.

## Phase 5: User Story 3 — Canadá (P3)

**Goal**: Publicar titulares de permissões de estudo válidas em 31 de dezembro por cidadania brasileira.

### Admission gate e tests first

- [x] T029 [US3] Fechar workbook, worksheet, Brasil, períodos e política de arredondamento/supressão no `research.md`
- [x] T030 [P] [US3] Criar fixture estrutural e testes RED de reader/adapter IRCC Estudo
- [x] T031 [P] [US3] Criar teste de integração RED para idempotência, status e snapshot anterior
- [x] T032 [P] [US3] Criar testes frontend/E2E RED para Canadá/Estudo e incompatibilidade entre fontes

### Implementation

- [x] T033 [US3] Implementar config, reference data e reader/adapter IRCC Estudo
- [x] T034 [US3] Implementar runner e publicação `VALID_PERMIT_HOLDERS/STUDY`
- [x] T035 [US3] Implementar rótulos e cobertura canadense no frontend
- [x] T036 [US3] Validar quickstart Canadá e gates completos

## Phase 6: Convergência e entrega

- [x] T037 Atualizar `README.md`, `docs/data-sources.md` e auditoria de fontes do frontend
- [x] T038 Confirmar sincronização byte a byte dos contratos e ausência de placeholders nos artefatos Spec Kit
- [x] T039 Executar format, lint, typecheck, unit, integração, contrato e build no backend
- [x] T040 Executar format, lint, typecheck, Vitest, build e Playwright real no frontend
- [x] T041 Revisar segurança, licenças, semântica, diffs e registrar evidências finais no `quickstart.md`
- [x] T042 Criar commits e PRs separados para backend e frontend, sem incluir mudanças locais fora do escopo

## Dependencies & Execution Order

- T001–T011 bloqueiam todas as histórias.
- US1 (T012–T020) bloqueia o início de US2.
- US2 (T021–T028) bloqueia o início de US3.
- US3 (T029–T036) bloqueia convergência.
- T012–T015, T022–T024 e T030–T032 podem ocorrer em paralelo dentro de suas fases, mas testes devem falhar antes da implementação correspondente.

## Definition of Done

Cada checkpoint regional exige contrato sincronizado, ingestão idempotente, API testada, UI acessível, ausência honesta, fonte exibida e E2E contra backend real de teste. CI verde sem E2E real não encerra a feature.
