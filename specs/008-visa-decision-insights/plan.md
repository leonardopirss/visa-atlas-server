# Implementation Plan: Indicadores de decisão e requisitos de vistos

**Feature:** `008-visa-decision-insights` · **Data:** 2026-11-16 · **Spec:** `spec.md`

## Summary

Expandir o domínio estatístico para resultados auditáveis de decisões, tempo de
processamento e inventário pendente, e versionar requisitos práticos das
modalidades. A entrega reutiliza os endpoints existentes, adiciona semântica e
proveniência ao contrato e só promove dados após gates específicos de fonte.

## Technical Context

- **Backend:** Node.js, NestJS, TypeScript strict, Prisma e PostgreSQL em
  `visa-atlas-server/`.
- **Frontend:** React 19, Vite, TanStack Query, TypeScript strict, Vitest e
  Playwright em `../visa-atlas-client/apps/web/`.
- **Contrato:** OpenAPI canônico em
  `../visa-atlas-client/specs/001-shared-api-contract/contracts/openapi.yaml`,
  espelho backend e pacote TypeScript gerado.
- **Persistência:** `MetricObservation` para valores estatísticos;
  `MetricDerivation` para proveniência; `VisaProgramRequirement` e
  `VisaProgramPathway` para fatos legais/transições versionados e ligados a
  `DatasetRelease`.
- **Performance:** manter cache/versionamento atual; detalhes adicionais são
  bounded e carregados pelos endpoints existentes.
- **Segurança:** sem PII; jobs protegidos; URLs HTTP(S) normalizadas; fontes e
  relatórios tratados como entrada não confiável.

## Architecture Decisions

### AD-001 — Taxa é observação derivada com linhagem explícita

`APPROVAL_RATE` e `REFUSAL_RATE` usam `value` inteiro em basis points e uma
relação 1:1 com `MetricDerivation`. Operand rows ligam cada componente de
numerador e denominador às observações brutas e registram papel/coefficient,
além de fórmula/precisão. Isso preserva o modelo de apresentação sem usar
floating point ou esconder que o denominador é `granted + refused`.

### AD-002 — População e programa são dimensões combináveis

`ComparisonGroup` e `MetricObservation` recebem `PopulationBasis`, chave de
população e `programKey` não nulos. A FK de cidadania torna-se nullable somente
para NATIONAL. O backfill mantém registros atuais como
`CITIZENSHIP:<ISO3>/ALL`; novos scopes exigem filtros explícitos e nunca são
fallback para BRA. Assim um programa pode ser nacional ou segmentado por
cidadania sem misturar dimensões ortogonais.

### AD-003 — Inventário é métrica; prazo-alvo é fato vigente

`PENDING_APPLICATIONS` usa a infraestrutura estatística, com metadados de
aproximação/arredondamento. `PROCESSING_TIME_TARGET` é requisito versionado da
modalidade, com duração/unidade original e vigência. Mediana/P90, P80,
projeções e backlog share ficam fora da v1 por falta de fonte admitida.

### AD-004 — Requisito legal não é série estatística

Taxas, fundos e direitos pertencem à modalidade e mudam por vigência. Valores
discriminados e condições em união fechada/versionada evitam forçar moeda ou
regra em `MetricObservation`/texto livre. Caminhos são arestas
`VisaProgramPathway`, nunca promessa de residência.

### AD-005 — Contrato aditivo, endpoints preservados

`Statistic` recebe scope/derivação/measurement opcionais e `VisaProgram` recebe
`requirements`/`pathways` opcionais. `citizenship` torna-se nullable apenas em
respostas NATIONAL explicitamente solicitadas; respostas legadas permanecem
strings. Os cinco endpoints existentes continuam sendo a única superfície REST.

## Delivery Slices

1. **Fundação contratual e de dados:** taxonomia, abrangência, derivação e
   requisitos versionados.
2. **US1/MVP:** resultados de decisão e taxas derivadas verificáveis para uma
   fonte admitida.
3. **US2:** prazo-alvo versionado e inventário pendente para fontes admitidas.
4. **US3:** custos, fundos, família, renovação e caminho de residência por
   modalidade.
5. **Convergência:** comparação, acessibilidade, E2E real, licenças e runbook.

## Proposed Project Structure

```text
visa-atlas-server/
  prisma/schema.prisma
  src/modules/statistics/
    services/metric-derivation.service.ts
  src/modules/ingestion/
    validation/decision-insight.validator.ts
  src/modules/visa-programs/
    visa-program-requirements.service.ts
  test/contract/
  test/integration/
  specs/008-visa-decision-insights/

visa-atlas-client/
  packages/contracts/src/generated/api.ts
  apps/web/src/features/filters/
  apps/web/src/features/country-detail/
  apps/web/src/features/comparison/
  apps/web/tests/real-e2e/
  specs/008-visa-decision-insights/
```

## Contract Impact

- Novos `MetricType`: `DECISIONS_REFUSED`, `DECISIONS_WITHDRAWN`,
  `DECISIONS_LAPSED`, `APPROVAL_RATE`, `REFUSAL_RATE` e
  `PENDING_APPLICATIONS`.
- `Statistic` ganha `populationScope`, `derivation` e `measurement` opcionais.
- `VisaProgram` ganha `requirements` e `pathways` opcionais; somente registros
  vigentes entram no detalhe público, enquanto o banco preserva histórico.
- Parâmetros explícitos `populationBasis`/`programKey` são adicionados; o campo
  de resposta `citizenship` é nullable apenas para NATIONAL.
- Nenhuma nova rota. A lista final de enums/campos depende do gate de contrato e
  deve ser aplicada de forma idêntica nos dois OpenAPI.

## Constitution Check

- [x] Eventos distintos não são fundidos; taxa exige universo comparável.
- [x] Zero, ausência, supressão e indisponibilidade continuam diferentes.
- [x] Numerador, denominador, release e fórmula são auditáveis.
- [x] O frontend consome contrato, não Prisma nem fonte governamental.
- [x] Cinco endpoints são preservados; mudança é aditiva e revisada em conjunto.
- [x] Não há PII, elegibilidade, score, ranking ou probabilidade individual.
- [x] Ingestão mantém idempotência, promoção atômica e último snapshot válido.
- [x] Testes de contrato, integração e E2E real são gates de conclusão.

## Dependencies and Gates

- `001-shared-api-contract` precisa aprovar taxonomia, scope e DTOs antes da
  migration.
- Cada fonte passa por gate documentado: evento, população, período, unidade,
  metodologia, licença, estabilidade estrutural e compatibilidade de pares.
- US2 não depende da publicação da taxa, mas depende da fundação contratual.
- US3 depende do modelo versionado de requisito, não das séries estatísticas.
- Comparação só agrupa valores com chave completa e unidade idêntica.

## Risks and Mitigations

- **Taxa enganosa:** derivação bloqueada por incompatibilidade e aviso constante.
- **Dados nacionais rotulados como BRA:** scope explícito e teste de contrato.
- **SLA confundido com tempo real:** métricas e microcopy distintas.
- **Regra legal envelhecida:** vigência, verificação, histórico e estado stale.
- **Contrato excessivo:** campos aditivos e optional; sem endpoint novo.
- **Mudança de planilha:** fingerprints estruturais, falha fechada e snapshot
  publicado preservado.
- **Moeda sugerir comparação:** valor original e agrupamento por moeda/base.

## Validation Strategy

- **Unitário:** matriz de derivação, arredondamento, scope, formatadores e fatos.
- **Contrato:** enums, campos opcionais, exemplos e retrocompatibilidade.
- **Integração:** staging/publicação, idempotência, rejeição, linhagem e vigência.
- **Componente:** seleção, ausência, fórmula, avisos, requisitos e acessibilidade.
- **E2E real:** API + PostgreSQL + frontend sem mocks das rotas validadas.
- **Operacional:** estrutura da fonte, licença, cache, release e rollback lógico.

## Definition of Done

Cada história possui fonte admitida, dados auditáveis, contrato sincronizado,
testes RED antes da implementação, ausência honesta e evidência no quickstart.
Nenhuma tarefa de implementação pode ser marcada concluída apenas por compilar.
