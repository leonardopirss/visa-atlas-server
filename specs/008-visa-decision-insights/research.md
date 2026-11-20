# Research: Indicadores de decisão e requisitos de vistos

**Feature:** `008-visa-decision-insights` · **Data:** 2026-11-16

## Decisions already supported by the codebase

1. `MetricObservation.value` é `BigInt`; basis points permitem taxas exatas em
   duas casas sem introduzir floating point no storage.
2. `ComparisonGroup` já separa dataset, métrica, cidadania, finalidade, período,
   unidade e metodologia; taxa precisa adicionalmente de linhagem entre pares.
3. `DatasetRelease` e `DataStatus` já suportam promoção auditável, revisão,
   estimativa, supressão e ausência.
4. `VisaProgram` já possui finalidade, patrocínio, verificação e URL oficial,
   sendo o agregado natural para requisitos legais versionados.
5. O comparador atual já falha fechado quando métrica, unidade, período ou grupo
   diferem; deve ser estendido, não substituído.

## Impact inventory — VDI-T001

| Camada | Arquivos/pontos de extensão | Impacto obrigatório |
|---|---|---|
| Prisma | `prisma/schema.prisma`, migration inicial e nova migration | Adicionar taxonomia, scope, linhagem e requisitos; revisar chaves/índices sem reclassificar registros atuais. |
| Contrato | `contracts/openapi.yaml`, OpenAPI canônico do frontend e tipos gerados | Evolução aditiva de `MetricType`, `Statistic` e `VisaProgram`; manter cinco endpoints e compatibilidade de payload. |
| DTO/filtros backend | `src/common/dto/statistics-query.dto.ts`, `src/common/contracts/public-api.types.ts` | Validar scope e métrica; cidadania hoje é sempre obrigatória/default `BRA` e não pode representar dado nacional. |
| Defaults | `src/modules/statistics/services/default-filters.service.ts` | A resolução hoje procura grupo apenas por cidadania/finalidade/métrica/período; deve incluir scope e não fazer fallback silencioso. |
| Presenters | `src/modules/statistics/services/statistic.presenter.ts` | Incluir scope/derivação; impedir soma genérica de percentuais ou tempos quando categorias de fonte forem agregadas. |
| Mapa/detalhe | `src/modules/statistics/statistics.service.ts`, `src/modules/countries/services/country-detail.service.ts` | Propagar novos metadados, formatar legenda por semântica e preservar indisponibilidade; avaliar se métricas não geográficas entram na cobertura do mapa. |
| Histórico | `src/modules/statistics/services/timeseries.service.ts` | Hoje exige período anual numérico e unidade/metodologia comuns; manter gate e acrescentar scope, formatação e suporte somente aos períodos aprovados. |
| Programas | `src/modules/visa-programs/visa-programs.service.ts` | Carregar apenas requisitos vigentes/verificados e expor histórico sem transformar ausência em `NO`. |
| Ingestão | adapters/configs/validators Eurostat, Home Office e IRCC em `src/modules/ingestion/` | Cada novo evento precisa de config/validator próprio, fingerprint, idempotência e promoção transacional; validators atuais são fechados por métrica. |
| Testes backend | `test/contract/`, `test/integration/`, `test/unit/`, `test/helpers/database.ts`, `test/fixtures/` | Cobrir contrato anterior/novo, backfill, invariantes de taxa, scope, vigência, idempotência e snapshot anterior com fixtures sintéticas. |
| Estado/filtros frontend | `apps/web/src/app/app-state.tsx`, `features/filters/`, `services/api/` | Expandir opções/query keys/validação; filtro atual mostra nacionalidade Brasil de forma fixa e precisa comunicar scope não segmentado. |
| Headline/detalhe | `components/ui/metric-headline.tsx`, `features/country-detail/components/country-tabs.tsx` | `METRIC_LABELS` é exaustivo; adicionar formatadores por unidade, fórmula/operandos, aviso e requisitos versionados. |
| Histórico frontend | `features/statistics/statistics-timeseries-chart.tsx` | O gráfico usa número inteiro e label genérico; precisa formatar basis points/dias e não misturar unidades/scopes. |
| Comparação | `features/comparison/comparison-compatibility.ts`, cards/view/tests | A chave atual usa métrica/unidade/período/grupo; acrescentar scope e bases de requisitos, sem ranking ou câmbio. |
| Cobertura/auditoria | `features/coverage/`, `features/audit/data-source-audit.ts` | Decidir quais métricas fazem sentido no mapa e atualizar declarações/fontes sem considerar ausência como erro. |
| E2E | `apps/web/tests/real-e2e/` e configuração de banco real | Validar contrato, API, PostgreSQL e UI sem mocks das rotas sob teste, incluindo ausência e incompatibilidade. |

### Critical findings

1. `presentAggregateStatistic` soma todas as categorias da fonte. Essa operação
   é válida para contagens aditivas, mas deve falhar fechada para percentuais,
   percentis, metas e requisitos.
2. `TimeseriesService` converte `period` para ano inteiro. Métricas mensais ou
   snapshots datados exigiriam contrato adicional; a feature v1 deve admitir
   apenas períodos anuais até uma decisão explícita.
3. A interface e a API assumem cidadania brasileira como dimensão global.
   Publicar dado nacional antes de implementar `PopulationScope` produziria uma
   afirmação falsa; por isso VDI-T006 bloqueia migrations e ingestão.
4. `MetricType` é enum exaustivo em Prisma, OpenAPI, tipos gerados, validators,
   labels, filtros, cobertura e fixtures. A alteração deve ser atômica entre os
   dois repositórios.
5. O comparador existente oferece uma base conservadora, mas `scope` e base do
   requisito precisam entrar na chave antes de qualquer alinhamento visual.

## Open research gates

Nenhuma fonte entra em implementação antes de preencher esta matriz com links e
evidências oficiais. A descoberta de fonte faz parte das tarefas, não desta
geração inicial de backlog.

| Gate | Evidência obrigatória | Resultado atual |
|---|---|---|
| Decisões | Evento exato de numerador e denominador | Pendente |
| População | Cidadania, nacionalidade, programa ou agregado nacional | Pendente |
| Período | Coorte, mês/ano de decisão e política de revisão | Pendente |
| Unidade | Contagem, basis points, dias corridos/úteis, moeda | Pendente |
| Processamento | Observado, percentil, meta ou estimativa | Pendente |
| Backlog | Definição de pendente e data de referência | Pendente |
| Requisitos | Texto vigente, data efetiva e modalidade aplicável | Pendente |
| Licença | Permissão de uso, atribuição e redistribuição | Pendente |
| Estrutura | Arquivo/worksheet/colunas e estratégia de fingerprint | Pendente |
| Histórico | Correção, substituição e retenção de versões | Pendente |

## Rejected shortcuts

- Calcular aprovação como concessões ÷ pedidos recebidos sem provar a mesma
  coorte/população.
- Tratar `APPLICATIONS_REFUSED` como `DECISIONS_REFUSED` por semelhança nominal.
- Usar calculadora oficial atual como histórico observado.
- Atribuir dado nacional à cidadania brasileira para satisfazer schema.
- Converter moeda no frontend sem fonte, data de câmbio e política de precisão.
- Extrair regra legal automaticamente e publicá-la sem revisão/verificação.

## Population scope decision — VDI-T006

**Decision (revised after contract audit):** use composable dimensions in
`ComparisonGroup` and `MetricObservation`: `PopulationBasis`, non-null
`populationKey`, non-null `programKey`, and nullable `citizenshipIso3`. Do not
create a relational scope entity or sentinel citizenship.

- `CITIZENSHIP` uses the ISO3 key and equal `citizenshipIso3`.
- `NATIONAL` uses `ALL` and `citizenshipIso3=null`.
- `programKey` is an independent, non-null `ALL` or namespaced dataset key, so a
  program can be national or segmented by citizenship.
- Uniqueness/comparison use basis + population key + program key; `NULL` never
  acts as logical identity.
- O backfill atribui `CITIZENSHIP` e o ISO3 atual a todos os registros
  existentes, sem alterar valor, release ou grupo.
- The API adds explicit `populationBasis` and `programKey`. Absence preserves
  `CITIZENSHIP:<citizenship>/ALL`; no automatic NATIONAL fallback exists.
- Existing response `citizenship` is widened to nullable and is null only for an
  explicit NATIONAL request. Legacy responses remain unchanged strings.

**Rationale:** non-null canonical keys keep PostgreSQL uniques/idempotency
reliable, nullable citizenship avoids assigning a national aggregate to Brazil,
and orthogonal `programKey` supports both national and citizenship-segmented
program data.

**Validation:** DTO rejeita pares inválidos, defaults consultam apenas o scope
solicitado, presenters sempre expõem o scope real e a chave de comparação inclui
tipo + chave.

## Processing and pending inventory sources — VDI-T003

### Canada — IRCC

**Pending inventory admitted with reservations:**
[Inside IRCC's application processing system](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/reports-statistics/statistics-open-data/immigration-stats/application-processing-system.html)
publishes applications not yet finalized for study and work permits. It is a
dated national/program snapshot, excludes extensions and rounds counts to a
multiple of five. Use `PENDING_APPLICATIONS`, `COUNT`, `PROGRAM` scope, preserve
rounding metadata and archive every ingested snapshot because no stable
structured historical download was identified.

**Backlog share not admitted under the current taxonomy:**
[Inventories and backlogs](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/immigration-system/levels/inventories-backlogs.html)
separates actual and projected percentages. It is not a pending count. It may
only enter a future `BACKLOG_SHARE` metric; projected values must never populate
observed history.

**Current processing time rejected for MEDIAN/P90:**
[IRCC processing times](https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.html)
and its [methodology](https://ircc.canada.ca/english/helpcentre/answer.asp?qnum=68&top=)
mix a backward-looking P80 concept with forward-looking estimates depending on
program. The JavaScript interface is a current calculator, not a stable series.
Admit only after adding explicit `PROCESSING_TIME_P80_HISTORICAL` or
`PROCESSING_TIME_ESTIMATE` types and versioned capture.

**Target admitted:** [IRCC service standards](https://www.canada.ca/en/immigration-refugees-citizenship/corporate/mandate/service-declaration/service-standards.html)
may populate `PROCESSING_TIME_TARGET`, with program scope and explicit calendar
or business-day unit. It must never be labeled observed processing time.

Canada reuse must follow the
[Open Government Licence — Canada 2.0](https://open.canada.ca/en/open-government-licence-canada/)
with attribution and no implied endorsement.

### United Kingdom — Home Office/UKVI

**Pending inventory admitted behind structural gate:**
[Migration transparency data](https://www.gov.uk/government/statistical-data-sets/migration-transparency-data)
provides quarterly ODS workbooks containing outstanding/WIP applications by
route, alongside application volume and performance against service standard.
Before adapter work, inspect exact worksheets, WIP definition, overseas versus
in-country split, archived releases and corrections. Use checksum and worksheet
fingerprint. WIP can map to `PENDING_APPLICATIONS`; performance percentage
requires a distinct future `WITHIN_SERVICE_STANDARD_RATE`.

**Target admitted, observed time rejected:**
[processing times outside the UK](https://www.gov.uk/guidance/visa-processing-times-applications-outside-the-uk)
and [UKVI service standards](https://www.gov.uk/government/organisations/uk-visas-and-immigration/about/about-our-services)
describe expectations for straightforward applications, normally working days
or weeks. They may populate `PROCESSING_TIME_TARGET` with route/application
location, never MEDIAN/P90.

Reuse follows the [GOV.UK terms and Open Government Licence](https://www.gov.uk/help/terms-conditions).

### European Union / Eurostat

**Rejected for processing/backlog:**
[Eurostat managed migration information](https://ec.europa.eu/eurostat/en/web/migration-asylum/managed-migration/information-data)
does not provide a harmonized legal-migration processing-time or pending-inventory
dataset. Metadata “timeliness” describes statistical delivery, not applicant
processing.

[Schengen application guidance](https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/applying-schengen-visa_en)
and the [EU Immigration Portal](https://home-affairs.ec.europa.eu/policies/migration-and-asylum/eu-immigration-portal/what-category-do-i-fit_en)
contain legal/indicative targets, not observed series, and do not automatically
match the current first-residence-permit population. Keep them outside the MVP
until a compatible `VisaProgram` is modeled.

### US2 admission decision

1. Admit Canada program-level pending snapshots first.
2. Admit UK WIP only after ODS structural inspection.
3. Admit Canada/UK service standards as `PROCESSING_TIME_TARGET`.
4. Defer MEDIAN/P90: no suitable harmonized primary source was found.
5. Reject P80, projections, backlog share and within-standard percentage under
   the current taxonomy instead of coercing them.

## Visa program requirement sources — VDI-T004

The database currently contains no production `VisaProgram` records, only
synthetic test fixtures. Therefore this gate evaluated the supported WORK/STUDY
families and identifies which concrete programs may be onboarded first. A
requirement cannot be published until its parent program is verified.

### Canada

**Study permit — admitted with conditions:**

- [IRCC fee list](https://ircc.canada.ca/english/information/fees/fees.asp):
  application/extension fee is normalizable as money per person and operation.
- [Proof of financial support](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html):
  normalizable by effective date, family size, annual unit and region; tuition
  and transportation remain separate facts. Quebec must not share the
  Canada-except-Quebec record.
- [Spouse open work permit](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/help-your-spouse-common-law-partner-work-canada.html):
  `DEPENDANTS_ALLOWED` and `SPOUSE_WORK_RIGHT` are always `DEPENDS`, with level,
  duration and eligible-program conditions.
- [Study permit extension](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/extend-study-permit.html):
  `RENEWABLE=DEPENDS`; do not encode a universal right.
- [Post-graduation work permit](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation.html):
  a possible transition, not permanent residence. Store the conditional chain
  `STUDY_PERMIT -> PGWP -> separate PR program`, never a guaranteed deadline.

**Work permit — partial admission:** fees can be split into processing and open
permit-holder facts from the IRCC fee list. A national proof-of-funds amount is
rejected because requirements vary by program/checklist. Family work rights are
`DEPENDS` on pathway, occupation/TEER, validity and effective rules per the
[official family eligibility page](https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/special-instructions/spouses-dependent-children/eligibility.html).
[Extension eligibility](https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada/extend/eligibility.html)
supports `RENEWABLE=DEPENDS`. No generic PR path or deadline is admitted.

### United Kingdom

**Skilled Worker — admitted with conditional dimensions:**

- [Costs and maintenance](https://www.gov.uk/skilled-worker-visa/how-much-it-costs)
  vary by application location, duration band, salary-list status, person and
  health-surcharge period. Store separate facts; never one universal fee.
- [Partner and children](https://www.gov.uk/skilled-worker-visa/your-partner-and-children)
  contains occupation and transition restrictions. Both dependent eligibility
  and spouse work right are `DEPENDS`.
- [Extension](https://www.gov.uk/skilled-worker-visa/extend-your-visa) supports
  `RENEWABLE=DEPENDS` while requirements continue to be met.
- Settlement deadline is blocked. Current
  [Immigration Rules Appendix Skilled Worker](https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-skilled-worker)
  and the [2 November 2026 government announcement](https://www.gov.uk/government/news/home-secretary-unveils-new-rules-for-migrants-settling-in-the-uk)
  require an effective-date/legal-text review before publishing any fixed period.

**Student — admitted with conditional dimensions:**

- [Student visa overview](https://www.gov.uk/student-visa/overview) provides a
  per-person application fee.
- [Financial evidence guidance](https://www.gov.uk/guidance/financial-evidence-for-student-and-child-student-route-applicants)
  is normalizable by London/outside-London, month cap, person role, tuition and
  holding-period condition.
- [Family members](https://www.gov.uk/student-visa/family-members) and
  [caseworker guidance](https://www.gov.uk/government/publications/student-route-caseworker-guidance/student-and-child-student)
  require `DEPENDS` for dependent eligibility and work rights.
- [Extension](https://www.gov.uk/student-visa/extend-your-visa) is conditional.
  Graduate permission is a separate temporary transition, not direct settlement.

### European Union and Germany

The [EU Blue Card overview](https://home-affairs.ec.europa.eu/policies/migration-and-asylum/eu-immigration-portal/eu-blue-card_en)
supports only common conditional facts such as minimum validity, renewability,
family access and mobility. It does not provide a single EU fee or proof-of-funds
amount; country ISO3 is mandatory for national facts.

Germany is the first viable concrete EU destination:

- [Study route](https://www.make-it-in-germany.com/en/visa-recognition/visa-types/studying)
  can provide annual proof of funds, conditional renewal and the transition to
  job-search/work permission. The
  [Federal Foreign Office](https://www.auswaertiges-amt.de/en/visa-service/visabestimmungen-node/sperrkonto-seite)
  confirms the blocked-account mechanism; current amount still needs effective
  year and source verification.
- [EU Blue Card Germany](https://www.make-it-in-germany.com/en/visa-recognition/visa-types/eu-blue-card)
  supports conditional validity, extension and settlement facts by contract
  duration and language level. These facts must not be generalized to the EU.

### Licensing and normalization decision

- GOV.UK content reuse follows the
  [Open Government Licence](https://www.gov.uk/help/reuse-govuk-content); prefer
  structured metadata/change history when available.
- European Commission material generally follows its
  [legal notice](https://commission.europa.eu/legal-notice_en); third-party
  content requires separate review.
- Canada pages require a page/dataset-specific licence check against
  [Canada.ca terms](https://www.canada.ca/en/library-archives/terms-conditions.html).
  Store short normalized facts and provenance, not copied legal text; commercial
  reuse remains an explicit admission gate.

Admit UK Skilled Worker, UK Student, Canada Study, Germany Study and Germany EU
Blue Card only after creating verified parent programs. Admit Canada Work family
rights only with structured conditions. Reject generic Canada Work funds, a
single EU fee/fund value, automatic PR and any fixed UK settlement deadline
until effective law is reconciled.

## Decision outcomes and rate derivation — VDI-T002 / VDI-T005

### United Kingdom — admitted conditionally as the MVP

The Home Office
[Immigration system statistics data tables](https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables)
and [official user guide](https://www.gov.uk/government/publications/user-guide-to-home-office-immigration-statistics--9/user-guide-to-immigration-statistics)
identify:

- `Vis_D01`: applications by nationality and visa type;
- `Vis_D02`: entry-clearance outcomes by nationality, visa type and outcome.

The Home Office also confirms that `Vis_D02` contains issued, refused,
withdrawn and lapsed outcomes and that structural instructions live in the
workbook `Notes` sheet in this
[official parliamentary answer](https://questions-statements.parliament.uk/written-questions/detail/2025-04-17/46360/).

**Admission:** `Vis_D02` is the only admitted candidate for the first rate MVP,
subject to inspecting the current workbook's `Notes` and data worksheet,
confirming Brazil, Work/Study visa type sets, complete annual periods, revision
policy, absence of duplicate totals and a stable structural fingerprint.

**Population and event:** entry-clearance application outcomes counted at
decision, not unique people or arrivals. Use `CITIZENSHIP:BRA`, destination GBR,
purpose derived from a reviewed visa-type set, `COUNT` and one complete calendar
year. Do not combine overseas entry clearance with in-country decisions.

**Raw metrics:**

- issued -> existing `DECISIONS_GRANTED`;
- refused -> new `DECISIONS_REFUSED`;
- withdrawn -> new `DECISIONS_WITHDRAWN`;
- lapsed -> new `DECISIONS_LAPSED`.

Withdrawn and lapsed remain queryable/auditable but are excluded from the MVP
rate denominator.

**Deterministic formulas:**

```text
determined = issued + refused
APPROVAL_RATE basis points = round_half_up(issued * 10_000 / determined)
REFUSAL_RATE  basis points = round_half_up(refused * 10_000 / determined)
```

Derivation requires the same dataset release, destination, population scope,
purpose, exact visa-type set/source categories, complete year, `COUNT` unit and
methodology version. It rejects missing/suppressed/estimated operands, zero
denominator, numerator greater than denominator, incomplete periods and
structural/methodological breaks. `REVISED` propagates to the result.

`Vis_D01` is never the denominator: applications are counted when made while
`Vis_D02` outcomes are counted when decided, so they are not proven to be the
same cohort. The UI label is “taxa derivada entre decisões emitidas ou
recusadas”, never application approval chance.

The v1 stores only locally derived rates. A directly published official rate
would require a distinct provenance mode in a later decision. Precision is fixed
to two percentage decimals (`BASIS_POINTS`).

Reuse is governed by the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/information-management/re-using-public-sector-information/uk-government-licensing-framework/open-government-licence/)
with Home Office attribution.

### Canada — rejected for the rate MVP

[IRCC Operational Processing monthly updates](https://open.canada.ca/data/en/dataset/9b34e712-513f-44e9-babf-9df4f7256550?res_page=1)
contain finalized and approved temporary-resident resources, but the catalogue
does not prove matching purpose, extensions, population and outcome categories.
Existing holder datasets measure people with effective/valid permits, not
application decisions. Reconsider only after workbook inspection proves a
compatible outcome pair; never combine holders with applications.

### Eurostat — rejected for decision rates

[Eurostat managed migration data](https://ec.europa.eu/eurostat/web/migration-asylum/managed-migration/information-data)
and the current education dataset
[`migr_resedu`](https://ec.europa.eu/eurostat/databrowser/view/migr_resedu%24defaultview/default/table?lang=en)
measure permits granted/issued, not applications and refusals. Even
[`migr_ressing` metadata](https://ec.europa.eu/eurostat/cache/metadata/en/migr_ressing_esms.htm)
describes recipients of a Single Permit rather than a refusal universe. These
sources remain valid for permit volumes but cannot produce approval/refusal rates.

## Questions still open in Phase 1

1. Como identificar modalidade quando a fonte usa categorias diferentes das
   páginas oficiais?
2. Quais requisitos condicionais precisam de dimensões estruturadas além de um
   resumo curto para não perder significado legal?

## Admission record template

Para cada fonte admitida, adicionar: organização, dataset/página, URL,
metodologia, licença, data de acesso, evento, população, finalidade, período,
unidade, campos estruturais, supressão, revisão, derivação permitida, riscos e
decisão `ADMITIDA` ou `REJEITADA`.
