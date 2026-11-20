# Data Model: Indicadores de decisão e requisitos de vistos

## Enum additions proposed for v1

```text
MetricType
├── DECISIONS_REFUSED
├── DECISIONS_WITHDRAWN
├── DECISIONS_LAPSED
├── APPROVAL_RATE
├── REFUSAL_RATE
└── PENDING_APPLICATIONS

PopulationBasis
├── CITIZENSHIP
└── NATIONAL

RequirementType
├── APPLICATION_FEE
├── PROOF_OF_FUNDS
├── DEPENDANTS_ALLOWED
├── SPOUSE_WORK_RIGHT
├── RENEWABLE
└── PROCESSING_TIME_TARGET

RequirementValueKind
├── MONEY
├── STATE
└── DURATION

RequirementState
├── YES
├── NO
├── DEPENDS
└── UNKNOWN
```

`PROCESSING_TIME_MEDIAN`, `PROCESSING_TIME_P90`, projections, P80 and backlog
share remain outside v1 because no compatible source was admitted.

## Composable population and program dimensions

`PROGRAM` is not a population basis: program and citizenship are orthogonal. Add
the following non-null dimensions to `ComparisonGroup` and
`MetricObservation`:

```text
populationBasis   CITIZENSHIP | NATIONAL
populationKey     String   # BRA for citizenship, ALL for national
programKey        String   # ALL or stable namespaced key
citizenshipIso3   String?  # FK populated only for CITIZENSHIP
```

### Invariants

1. `CITIZENSHIP` requires ISO3 `populationKey`, equal non-null
   `citizenshipIso3`.
2. `NATIONAL` requires `populationKey=ALL` and `citizenshipIso3=null`.
3. `programKey` is always non-null: `ALL` or a stable namespaced key such as
   `home-office:entry-clearance:work` or `ircc:study-permit`.
4. A source may combine `CITIZENSHIP:BRA` with a program key or
   `NATIONAL:ALL` with a program key.
5. Identity, unique indexes, cache and comparison keys use basis, population
   key and program key; localized labels never participate.
6. Legacy requests resolve `CITIZENSHIP:<citizenship>/ALL`. NATIONAL/program
   data requires explicit query parameters and is never a fallback.
7. Response `citizenship` is nullable only for explicitly requested NATIONAL
   data; all legacy responses remain strings.

## MetricObservation changes

- Keep `value BigInt?`.
- Use `BASIS_POINTS` for rates and `COUNT` for pending inventory.
- Add optional measurement metadata: `approximate`, `roundingIncrement` and
  `precision` so rounded official counts are not presented as exact.
- Add the composable scope dimensions above to uniques and indexes.

## MetricDerivation and operands

```text
MetricDerivation
├── id                     String PK
├── observationId          String unique FK -> derived MetricObservation
├── formula                APPROVAL_RATE | REFUSAL_RATE
├── precision              Int (v1 = 2)
├── validatedAt            DateTime
└── qualityReport          Json?

MetricDerivationOperand
├── id                     String PK
├── derivationId           String FK -> MetricDerivation
├── observationId          String FK -> raw MetricObservation
├── role                   NUMERATOR_COMPONENT | DENOMINATOR_COMPONENT
└── coefficient            Int (v1 = 1)
```

### Derivation invariants

1. Result metric is `APPROVAL_RATE` or `REFUSAL_RATE`.
2. At least one numerator and one denominator operand exists; all are `COUNT`,
   non-null, non-suppressed and non-estimated.
3. Aggregated denominator is positive and numerator does not exceed it.
4. Release, destination, population/program dimensions, purpose, exact source
   category set, complete annual period and methodology are identical.
5. Approval uses granted as numerator and granted + refused as denominator;
   refusal uses refused and the same denominator.
6. Withdrawn/lapsed remain raw and are excluded from the v1 denominator.
7. Basis points use deterministic `round_half_up` at precision 2; `REVISED`
   propagates when any operand is revised.
8. Operand rows belong to the derived release transaction. Rejecting/deleting a
   release cascades result, derivation and operands without deleting unrelated
   source observations; integration tests verify no orphan.

## VisaProgramRequirement

```text
id                     String PK
visaProgramId          String FK -> VisaProgram
releaseId              String FK -> DatasetRelease
type                   RequirementType
valueKind              MONEY | STATE | DURATION
amount                 Decimal?       # MONEY
currency               String?        # ISO 4217, MONEY
basis                  RequirementBasis?
maxPeriods             Int?
state                  RequirementState? # STATE
durationAmount         Int?           # DURATION
durationUnit           DAYS_CALENDAR | DAYS_BUSINESS | WEEKS | MONTHS | YEARS
conditions             Json
conditionSchemaVersion String
conditionKey           String # canonical SHA-256 of type/basis/conditions
conditionSummary       String?
effectiveAt            Date
effectiveUntil         Date?          # exclusive
verifiedAt             DateTime
officialUrl            String
sourceFingerprint      String
```

### Requirement value and condition rules

- `MONEY` requires canonical Decimal, ISO 4217 currency and basis:
  `PER_APPLICATION`, `PER_PERSON`, `PER_MONTH`, `PER_YEAR` or `TOTAL`.
- `STATE` requires `YES`, `NO`, `DEPENDS` or `UNKNOWN`. `UNKNOWN` is allowed
  only when the official source itself states indetermination; missing record
  means unavailable/not published. `DEPENDS` requires a typed condition.
- `DURATION` requires positive integer and original unit. Weeks are not
  converted to days.
- `conditions` is a closed, versioned discriminated union. V1 kinds:
  `FAMILY_SIZE`, `GEOGRAPHIC_SCOPE`, `APPLICATION_LOCATION`,
  `APPLICATION_CONTEXT`, `PERSON_ROLE`, `DURATION_MONTHS`,
  `FUNDS_HOLDING_DAYS`, `PROGRAM_LEVEL` and `OCCUPATION_CLASS`.
- `conditionSummary` is reviewed display text only. Logic and comparison never
  parse it.
- Family sizes supported by the source are separate records. V1 does not infer
  an extra-person formula unless a later typed calculation schema is approved.
- `releaseId` provides organization, dataset, checksum, fetched/published time
  and atomic promotion. Fingerprint alone is not provenance.
- `effectiveAt/effectiveUntil` are civil dates; `verifiedAt` is an instant.
- `conditionKey` is a server-generated SHA-256 of canonicalized
  type/basis/conditions and is never accepted from public input.
- Overlap for the same program/condition key is blocked by a PostgreSQL
  `daterange` exclusion constraint created in raw migration SQL. Writes also run
  in a transaction; concurrent-overlap tests are required.

The v1 public country detail returns optional `requirements` containing current
records only, bounded and ordered. Historical rows remain auditable in the
database but are not added to the public payload in this release.

## VisaProgramPathway

```text
id                     String PK
fromVisaProgramId      String FK -> VisaProgram
releaseId              String FK -> DatasetRelease
targetRouteCode        String
pathwayType            POST_STUDY_WORK | PERMANENT_RESIDENCE
state                  YES | DEPENDS | UNKNOWN
qualifyingPeriodMonths Int?
conditions             Json (same closed/versioned union)
conditionSchemaVersion String
conditionKey           String # canonical SHA-256 of route/type/conditions
effectiveAt            Date
effectiveUntil         Date? (exclusive)
verifiedAt             DateTime
officialUrl            String
sourceFingerprint      String
```

Each record is one conditional edge, not a promise of the final destination.
For example, Study Permit -> PGWP and PGWP -> separate PR program are different
edges. A possible transition never renders as guaranteed residence.

## Migration strategy

1. Add enums, tables and nullable scope columns.
2. Backfill existing groups/observations as
   `CITIZENSHIP:<existing ISO3>/ALL`.
3. Validate checks, then make basis/key/program columns `NOT NULL`.
4. Make `citizenshipIso3` nullable with checks for NATIONAL/CITIZENSHIP.
5. Replace uniques/indexes with composable dimensions.
6. Add requirement/pathway date exclusion constraints in raw SQL.
7. Do not recalculate or reclassify historical observations.
8. Logical rollback hides new types; destructive enum/table removal is not
   automated.
