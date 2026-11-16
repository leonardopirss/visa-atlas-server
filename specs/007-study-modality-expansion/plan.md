# Implementation Plan: Modalidade Estudo com fontes oficiais

**Branch**: `007-study-modality-expansion` | **Date**: 2026-11-16 | **Spec**: `spec.md`

## Summary

Expandir o recorte público de `BRA/WORK` para `BRA/{WORK,STUDY}` nas cinco rotas existentes. A entrega é incremental: Eurostat Europa primeiro, Home Office Reino Unido depois e IRCC Canadá por último. O frontend ganha seletor de finalidade e invalidação coerente de filtros. Cada fonte mantém evento, métrica, unidade, release, categoria e grupo de comparação próprios.

## Technical Context

**Language/Version**: TypeScript strict, Node.js >=22

**Primary Dependencies**: NestJS, Prisma, PostgreSQL, React 19, TanStack Query, MapLibre, Vite

**Storage**: PostgreSQL; migration aditiva de enum `VisaPurposeCode`

**Testing**: Jest/Supertest no backend; Vitest/Testing Library e Playwright no frontend

**Target Platform**: API Linux/containers e navegadores modernos responsivos

**Project Type**: Dois repositórios coordenados: serviço REST e SPA web

**Performance Goals**: Manter os limites e cache atuais; nenhuma rota adicional; ingestões fora do request path

**Constraints**: Cinco rotas v1 preservadas; `BRA` permanece única cidadania; fontes incompatíveis não podem ser comparadas; último snapshot válido deve sobreviver a falhas

**Scale/Scope**: Europa (32 destinos configurados), Reino Unido e Canadá, duas finalidades e três famílias de fonte

## Constitution Check

*GATE inicial: aprovado. Revalidar após design e após cada fase regional.*

- [x] Nenhum valor será inventado; `0`, `null` e supressão permanecem distintos.
- [x] O OpenAPI será atualizado antes dos consumidores.
- [x] Frontend continuará consultando somente DTOs públicos.
- [x] Não haverá endpoint novo nem dependência nova.
- [x] Métricas e grupos incompatíveis permanecerão separados.
- [x] Cada release manterá fonte, checksum, categoria original e auditoria.
- [x] Testes de contrato, integração e E2E real são obrigatórios.
- [x] A expansão de escopo para `STUDY` foi solicitada explicitamente e documentada.

## Architecture Decisions

### AD-001 — `STUDY` é finalidade, não métrica

Adicionar `STUDY` a `VisaPurposeCode` e ao schema OpenAPI. A métrica descreve o evento medido por cada fonte: primeiras autorizações europeias, aplicações/concessões britânicas ou titulares canadenses.

### AD-002 — Europa usa `migr_resedu`

O adaptador Eurostat será parametrizado por categorias de finalidade. Trabalho permanece em `migr_resfirst/EMP`; Estudo usa o dataset oficial específico `migr_resedu`. Ambos usam `FIRST_RESIDENCE_PERMITS_GRANTED`, mas possuem datasets, purpose e comparison groups distintos. Essa separação é obrigatória porque a promoção atômica despublica releases anteriores dentro do mesmo `SourceDataset`.

### AD-003 — Defaults dependem da finalidade

O frontend limpa ano e grupo antes de buscar defaults da nova finalidade. A necessidade de parâmetros em `/filters/defaults` será confirmada durante o contrato; nenhuma rota nova será criada.

### AD-004 — Uma configuração por fonte e finalidade

Home Office e IRCC reutilizam clientes, readers e pipeline existentes, mas ganham configs/datasets/runners de Estudo. Código compartilhado só será extraído quando a duplicação for real e testada.

### AD-005 — Cobertura global não é comparação

O modo Todos os países pode consultar múltiplas métricas para marcar disponibilidade. Cartões de comparação exigem mesma finalidade, métrica, unidade, período e comparison group; caso contrário mostram incompatibilidade explícita.

## Delivery Phases

### Phase A — Fundação contratual

- Atualizar OpenAPI canônico e snapshot do backend com `STUDY`.
- Adicionar migration Prisma, seed/reference data e validação DTO.
- Regenerar contratos do frontend e ampliar tipos/validadores.
- Testar retrocompatibilidade de `WORK` e validação de finalidade inválida.

### Phase B — Europa (P1)

- Generalizar config/client/runner Eurostat para finalidade parametrizada.
- Adicionar `BRA/STUDY/EDUC` e testes de adapter, integração, idempotência e publicação.
- Implementar seletor Trabalho/Estudo e coerência de defaults no frontend.
- Cobrir mapa, detalhe, histórico, ausência e E2E real.

### Phase C — Reino Unido (P2)

- Fechar admission gate da tabela Home Office e evento medido.
- Adicionar config, reader/adapter se necessário, referência, runner e testes.
- Adicionar rótulo/evento exato e cobertura do Reino Unido no frontend.
- Validar falha fechada com mudança estrutural.

### Phase D — Canadá (P3)

- Fechar admission gate do dataset IRCC por cidadania e evento anual.
- Adicionar config, reader/adapter, referência, runner e testes.
- Adicionar rótulo de titulares de permissão de estudo e cobertura no frontend.
- Validar supressão/arredondamento e incompatibilidade entre fontes.

## Project Structure

```text
visa-atlas-server/
├── contracts/openapi.yaml
├── prisma/schema.prisma
├── prisma/migrations/<timestamp>_add_study_purpose/
├── src/common/dto/statistics-query.dto.ts
├── src/modules/ingestion/adapters/{eurostat,uk-home-office,ircc-canada}/
├── src/modules/ingestion/*-ingestion-runner.service.ts
├── test/{contract,integration,unit}/
└── specs/007-study-modality-expansion/

visa-atlas-client/
├── specs/001-shared-api-contract/contracts/openapi.yaml
├── packages/contracts/src/generated/api.ts
├── apps/web/src/{app,features,services}/
├── apps/web/tests/{e2e,real-e2e}/
└── specs/007-study-modality-expansion/
```

**Structure Decision**: Manter monólito modular NestJS e SPA React atuais; coordenar contrato e fases por documentos Spec Kit espelhados, sem criar pacote ou serviço novo.

## Contract Impact

- Expandir enum Purpose de `[WORK]` para `[WORK, STUDY]` em parâmetros e payloads.
- Manter `MetricType` existente na primeira fase; os três eventos planejados já possuem enum semanticamente adequado.
- Estender `/filters/defaults` com filtros opcionais somente se o estudo de implementação confirmar que o frontend não consegue resolver defaults de finalidade com o contrato atual.
- Regenerar `packages/contracts` e sincronizar `visa-atlas-server/contracts/openapi.yaml` byte a byte.

## Validation Strategy

- **Contrato**: OpenAPI, schemas gerados e Supertest para WORK/STUDY/inválido.
- **Backend unitário**: category mapping, shape, unidades, status e valores seguros.
- **Backend integração**: staging, idempotência, publicação, release anterior e queries por purpose.
- **Frontend unitário**: troca de finalidade, invalidação, queries, rótulos e compatibilidade.
- **E2E mockado**: fluxo responsivo e acessível.
- **E2E real**: frontend contra backend e banco de teste com fixtures estruturais, sem interceptar as rotas validadas.
- **Qualidade**: format, lint, typecheck, unit/integration/contract, build e audit existente.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Expansão do escopo constitucional `BRA/WORK` | Usuário solicitou explicitamente `STUDY`; a feature mantém `BRA` e fontes oficiais | Adicionar apenas opção visual produziria filtro sem dados e violaria integridade estatística |
