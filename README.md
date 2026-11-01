# Visa Atlas API

Visa Atlas is a public API for exploring official migration indicators by destination country. Its current scope is Brazilian citizenship (`BRA`) and work as the migration purpose (`WORK`), with safeguards against mixing incompatible metrics, units, periods, or methodologies.

The service is built with NestJS 12, strict TypeScript, PostgreSQL, and Prisma. It maintains a worldwide catalog of 249 countries, publishes only validated dataset releases, and exposes five versioned HTTP operations under `/api/v1`.

## Table of contents

- [Current scope](#current-scope)
- [Technology stack](#technology-stack)
- [Architecture and data flow](#architecture-and-data-flow)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Public API](#public-api)
- [Data semantics](#data-semantics)
- [Official data ingestion](#official-data-ingestion)
- [Database](#database)
- [Security and HTTP behavior](#security-and-http-behavior)
- [Testing and quality](#testing-and-quality)
- [Project structure](#project-structure)
- [OpenAPI contract](#openapi-contract)
- [Operations and limitations](#operations-and-limitations)
- [Additional documentation](#additional-documentation)

## Current scope

The backend serves the global `BRA / WORK` MVP and explicitly distinguishes three statistical domains:

| Destinations                 | Source                        | Metric                            | Unit      | Meaning                                                |
| ---------------------------- | ----------------------------- | --------------------------------- | --------- | ------------------------------------------------------ |
| European reporting countries | Eurostat `migr_resfirst`      | `FIRST_RESIDENCE_PERMITS_GRANTED` | `PER`     | First residence permits granted for employment reasons |
| United Kingdom               | UK Home Office `Occ_D02`      | `WORK_VISAS_ISSUED`               | `VISAS`   | Sponsored work visa grants by visa subgroup            |
| Canada                       | IRCC `IMP_CITZ_YEAR_END_WORK` | `VALID_PERMIT_HOLDERS`            | `HOLDERS` | IMP holders with a valid work permit on December 31    |

These figures are not approval rates, individual probabilities, or measurements that can be compared directly across sources. Every observation retains its dataset, release, original source category, unit, and `comparisonGroupId`.

The domain also supports visa programs and official links. Visa programs are returned only when both a verification timestamp and an official URL are present. The public `sources` array is derived from published observations; official-link records are not serialized separately by the current contract.

## Technology stack

- Node.js 24 LTS; `package.json` accepts versions `>=24 <27`;
- npm 11 or another version compatible with the lockfile;
- NestJS 12 with Express;
- TypeScript 5 in strict mode with ESM/NodeNext modules;
- PostgreSQL 17 in the local Docker environment; PostgreSQL 15+ is supported externally;
- Prisma 6 for the schema, migrations, and database access;
- Jest 30, Supertest, and `ts-jest` for tests;
- ESLint 9 and Prettier 3;
- OpenAPI 3.1 as the versioned public contract.

## Architecture and data flow

The project is a modular NestJS monolith. Controllers receive and validate requests, services resolve filters and comparability rules, Prisma handles persistence, and source adapters convert external formats into normalized observations.

```text
Official sources
  ├── Eurostat JSON-stat 2
  ├── UK Home Office XLSX
  └── IRCC Canada XLSX
          │
          ▼
fetch → parse/adapt → validate → stage → checksum/deduplicate → publish
          │                                                   │
          └──────── a rejected release preserves ─────────────┘
                         the previous publication
                                                              │
                                                              ▼
                                      PostgreSQL / PUBLISHED releases
                                                              │
                                                              ▼
                                           Public REST API /api/v1
```

Important flow properties:

- ingestion is internal and has no HTTP endpoint;
- a SHA-256 checksum makes repeated ingestion of the same payload idempotent;
- new observations are first written to a staging release;
- only validated releases can be promoted;
- promotion and demotion of the previous release occur in one transaction;
- download, parsing, or validation failures do not replace the published snapshot;
- public queries read only releases with `PUBLISHED` status;
- the internal publishing service supports logical rollback to a previously verified release, covered by tests.

## Quick start

### Prerequisites

- Node.js 24;
- npm;
- Docker with Docker Compose, or an accessible PostgreSQL instance.

### Run locally with Docker

```bash
cp .env.example .env
docker compose up -d postgres redis
npm ci
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

The API will be available at `http://localhost:3000/api/v1`.

Docker Compose starts PostgreSQL with a persistent volume and an ephemeral Redis suitable only for local development/testing. Redis integration remains disabled until `REDIS_ENABLED=true`; the existing HTTP behavior is unchanged while it is disabled. At application startup, the versioned catalog of 249 countries is synchronized idempotently. Catalog synchronization does not create statistical data; run at least one [official ingestion job](#running-ingestion-jobs) to publish observations.

Basic checks:

```bash
curl 'http://localhost:3000/api/v1/countries?pageSize=3'
curl http://localhost:3000/api/v1/filters/defaults
```

### Run a production build

```bash
npm ci
npm run prisma:generate
npm run build
npm run prisma:migrate
npm start
```

`npm start` runs `dist/main.js`, so a compiled build must exist before startup.

## Configuration

Copy `.env.example` to `.env`. The application validates its environment during startup.

| Variable                          | Required     | Default                     | Description                                                    |
| --------------------------------- | ------------ | --------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL`                    | yes          | —                           | PostgreSQL URL used by Prisma; must start with `postgresql://` |
| `TEST_DATABASE_URL`               | no           | derived from `DATABASE_URL` | Isolated test database or schema; its name must contain `test` |
| `PORT`                            | no           | `3000`                      | HTTP port; must be a positive integer                          |
| `CORS_ORIGINS`                    | no           | `http://localhost:5173`     | Comma-separated list of allowed origins                        |
| `CLOUDFLARE_ORIGIN_LOCK_ENABLED`  | no           | `false`                     | Accept requests only through the configured Cloudflare edge    |
| `CLOUDFLARE_ALLOWED_HOSTS`        | when locked  | —                           | Comma-separated public API hostnames                           |
| `CLOUDFLARE_IP_RANGES`            | when locked  | —                           | Cloudflare IPv4/IPv6 CIDRs, comma-separated                    |
| `CACHE_TTL_SECONDS`               | no           | `60`                        | HTTP cache TTL for successful responses                        |
| `RATE_LIMIT_TTL_MS`               | no           | `60000`                     | Rate-limit window in milliseconds                              |
| `RATE_LIMIT_MAX`                  | no           | `120`                       | Maximum requests per IP per window                             |
| `REDIS_ENABLED`                   | no           | `false`                     | Enables the shared Redis foundation                            |
| `REDIS_URL`                       | when enabled | —                           | Redis URL; production requires `rediss://`                     |
| `REDIS_CONNECT_TIMEOUT_MS`        | no           | `1000`                      | Redis socket connection timeout                                |
| `REDIS_COMMAND_TIMEOUT_MS`        | no           | `250`                       | Per-command deadline before controlled degradation             |
| `REDIS_KEY_PREFIX`                | no           | `visa-atlas:<environment>`  | Environment-isolated Redis key prefix                          |
| `REDIS_CIRCUIT_FAILURE_THRESHOLD` | no           | `5`                         | Consecutive failures before opening the circuit                |
| `REDIS_CIRCUIT_RESET_MS`          | no           | `10000`                     | Delay before a half-open circuit probe                         |
| `REDIS_RECONNECT_MAX_DELAY_MS`    | no           | `1000`                      | Maximum reconnect backoff delay                                |
| `REDIS_RECONNECT_MAX_ATTEMPTS`    | no           | `3`                         | Reconnect attempts per connection cycle                        |
| `OPENAPI_PATH`                    | no           | `contracts/openapi.yaml`    | Contract checked by `npm run contract:validate`                |

Sanitized local example:

```dotenv
DATABASE_URL=postgresql://visa_atlas:visa_atlas@localhost:5432/visa_atlas?schema=public
TEST_DATABASE_URL=postgresql://visa_atlas:visa_atlas@localhost:5432/visa_atlas?schema=public_test
PORT=3000
CORS_ORIGINS=http://localhost:5173
CACHE_TTL_SECONDS=60
RATE_LIMIT_TTL_MS=60000
RATE_LIMIT_MAX=120
REDIS_ENABLED=false
REDIS_URL=redis://localhost:6379
REDIS_CONNECT_TIMEOUT_MS=1000
REDIS_COMMAND_TIMEOUT_MS=250
REDIS_KEY_PREFIX=visa-atlas:development
REDIS_CIRCUIT_FAILURE_THRESHOLD=5
REDIS_CIRCUIT_RESET_MS=10000
REDIS_RECONNECT_MAX_DELAY_MS=1000
REDIS_RECONNECT_MAX_ATTEMPTS=3
```

Never commit real `.env` files or reuse production databases, schemas, or credentials in tests.
Remote/production Redis connections must use `rediss://`; store the URL in the deployment secret manager and never expose it to the browser.

## Fly.io deployment through Cloudflare

The production path is Cloudflare proxy/WAF → Fly.io → NestJS, with Supabase PostgreSQL and an external TLS Redis service. `fly.toml` declares the `visa-atlas-server` application in Amsterdam, colocated with the current Supabase region, and a TCP health check. The application-level origin lock rejects the public `*.fly.dev` hostname and traffic whose Fly-observed source address is outside the configured Cloudflare ranges.

Before the first deployment:

1. Add `FLY_API_TOKEN` to the protected GitHub `production` environment.
2. Set `DATABASE_URL`, `REDIS_URL`, `RATE_LIMIT_IDENTITY_SECRET`, and the remaining runtime configuration with `fly secrets set`.
3. Apply committed Prisma migrations through the separate database-release procedure before deploying code that depends on them.
4. Until a custom domain exists, keep `CLOUDFLARE_ORIGIN_LOCK_ENABLED=false` and optionally set `API_SMOKE_URL=https://visa-atlas-server.fly.dev/api/v1/countries?pageSize=1` in the GitHub environment.
5. After adding a domain, set `CLOUDFLARE_ORIGIN_LOCK_ENABLED=true`, the exact public hostname in `CLOUDFLARE_ALLOWED_HOSTS`, and the current values published at `https://www.cloudflare.com/ips-v4` and `https://www.cloudflare.com/ips-v6` in `CLOUDFLARE_IP_RANGES`.
6. Add the custom API hostname to Fly, proxy its DNS record through Cloudflare, and select Cloudflare SSL/TLS mode **Full (strict)**.

On a push to `main`, `.github/workflows/api.yml` waits for all validation gates, deploys the Docker image, waits for the Fly health check, and runs the optional smoke test. Database migrations are intentionally outside this deploy workflow. Keep the GitHub production environment approval enabled when manual promotion is required.

## Public API

Local base URL: `http://localhost:3000/api/v1`.

| Method | Route                         | Purpose                                                                       |
| ------ | ----------------------------- | ----------------------------------------------------------------------------- |
| `GET`  | `/filters/defaults`           | Return default filters and the latest available annual release                |
| `GET`  | `/countries`                  | Search and list the worldwide country catalog with pagination                 |
| `GET`  | `/stats/map`                  | Return one statistic for every country in the same comparable slice           |
| `GET`  | `/countries/:iso3`            | Return a country, aggregate statistic, classifications, programs, and sources |
| `GET`  | `/countries/:iso3/timeseries` | Return a comparable annual series for one country                             |

Country identifiers use ISO 3166-1 alpha-3. Lowercase path and query values are normalized to uppercase where applicable.

### `GET /filters/defaults`

This endpoint has no parameters. If no release is published, `year` and `comparisonGroupId` are `null`, and `dataAvailable` is `false`.

```bash
curl http://localhost:3000/api/v1/filters/defaults
```

Response shape:

```json
{
  "citizenship": "BRA",
  "purpose": "WORK",
  "year": 2025,
  "metricType": "FIRST_RESIDENCE_PERMITS_GRANTED",
  "comparisonGroupId": "comparable-group",
  "unit": "PER",
  "dataAvailable": true
}
```

### `GET /countries`

| Parameter  | Default | Rules                                                |
| ---------- | ------- | ---------------------------------------------------- |
| `search`   | —       | Portuguese name, ISO2, or ISO3; up to 100 characters |
| `page`     | `1`     | Integer starting at 1                                |
| `pageSize` | `30`    | Integer from 1 to 100                                |

```bash
curl 'http://localhost:3000/api/v1/countries?search=portugal&page=1&pageSize=10'
```

Response shape:

```json
{
  "data": [{ "iso3": "PRT", "iso2": "PT", "name": "Portugal", "region": "Europa" }],
  "page": 1,
  "pageSize": 10,
  "total": 1
}
```

Country names and regions are currently returned in Brazilian Portuguese because they come from the versioned catalog used by the application.

### Common statistics parameters

`/stats/map` and `/countries/:iso3` accept:

| Parameter           | Default                           | Rules                                              |
| ------------------- | --------------------------------- | -------------------------------------------------- |
| `citizenship`       | `BRA`                             | Three-letter ISO3 code                             |
| `purpose`           | `WORK`                            | Currently limited to `WORK`                        |
| `year`              | latest published                  | Integer starting at 1900                           |
| `metricType`        | `FIRST_RESIDENCE_PERMITS_GRANTED` | One value from the metric enum                     |
| `comparisonGroupId` | resolved automatically            | Up to 200 characters; must match the other filters |

Metric values accepted by the contract:

- `FIRST_RESIDENCE_PERMITS_GRANTED`;
- `WORK_VISAS_ISSUED`;
- `VALID_PERMIT_HOLDERS`;
- `APPLICATIONS_RECEIVED`;
- `APPLICATIONS_REFUSED`;
- `DECISIONS_GRANTED`.

The first three currently have ingestion pipelines. Without an explicit year or group, a metric with no published release returns an honest absence of data, never an assumed zero. An explicit year or `comparisonGroupId` that cannot be resolved returns `422`.

### `GET /stats/map`

Returns every country in the catalog. Each country has a `statistic`, including countries without a matching observation.

```bash
curl 'http://localhost:3000/api/v1/stats/map?metricType=WORK_VISAS_ISSUED&year=2025'
```

Abbreviated response:

```json
{
  "citizenship": "BRA",
  "purpose": "WORK",
  "year": 2025,
  "countries": [
    {
      "iso3": "GBR",
      "statistic": {
        "metricType": "WORK_VISAS_ISSUED",
        "value": 819,
        "dataStatus": "AVAILABLE",
        "freshness": "CURRENT",
        "unit": "VISAS",
        "period": "2025",
        "comparisonGroupId": "comparable-group",
        "source": {
          "organization": "UK Home Office",
          "datasetCode": "Occ_D02",
          "releaseId": "published-release",
          "url": "https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables",
          "methodologyUrl": "https://www.gov.uk/",
          "fetchedAt": "2026-08-20T00:00:00.000Z",
          "publishedAt": "2026-08-20T00:00:00.000Z"
        }
      }
    }
  ],
  "legendLabel": "Vistos de trabalho emitidos; volume administrativo, não probabilidade"
}
```

The identifiers and timestamps above are illustrative; the real response depends on the releases in the database. Some user-facing labels remain in Brazilian Portuguese because that is the current API behavior.

### `GET /countries/:iso3`

This endpoint accepts the common statistics parameters and returns:

- country identity;
- the aggregate statistic for the selected group;
- the original classifications included in that aggregate;
- verified visa programs;
- references to the published sources.

```bash
curl 'http://localhost:3000/api/v1/countries/CAN?metricType=VALID_PERMIT_HOLDERS&year=2024'
```

A known country without observations still returns `200`, with `value: null`, `dataStatus: "UNAVAILABLE"`, empty lists, and `source: null`. A valid ISO3 code not found in the catalog returns `404`.

### `GET /countries/:iso3/timeseries`

| Parameter           | Default                           | Rules                                                 |
| ------------------- | --------------------------------- | ----------------------------------------------------- |
| `citizenship`       | `BRA`                             | Three-letter ISO3 code                                |
| `purpose`           | `WORK`                            | Currently limited to `WORK`                           |
| `metricType`        | `FIRST_RESIDENCE_PERMITS_GRANTED` | Requested metric                                      |
| `comparisonGroupId` | —                                 | Optional group, up to 200 characters                  |
| `fromYear`          | no lower bound                    | Integer starting at 1900                              |
| `toYear`            | no upper bound                    | Integer starting at 1900 and not less than `fromYear` |

```bash
curl 'http://localhost:3000/api/v1/countries/CAN/timeseries?metricType=VALID_PERMIT_HOLDERS&fromYear=2020&toYear=2024'
```

The series only combines periods from the same dataset, unit, and methodology version. If no observations exist, `points` is an empty array. Inverted ranges or incompatible dimensions return `422`.

### Errors

Errors use a stable shape and never return a stack trace:

```json
{
  "code": "INCOMPATIBLE_DIMENSIONS",
  "message": "The requested dimensions are not comparable",
  "correlationId": "f7ab85f0-cfe2-49ed-85d8-e822ee3bc1ba"
}
```

Main statuses:

| Status | Typical code              | Situation                                       |
| ------ | ------------------------- | ----------------------------------------------- |
| `400`  | `VALIDATION_ERROR`        | Invalid or unknown path/query input             |
| `404`  | `RESOURCE_NOT_FOUND`      | Country does not exist in the catalog           |
| `422`  | `INCOMPATIBLE_DIMENSIONS` | Group, period, or dimensions are not comparable |
| `429`  | `RATE_LIMIT_EXCEEDED`     | Per-IP request limit exceeded                   |
| `500`  | `INTERNAL_ERROR`          | Unexpected failure with a sanitized message     |

## Data semantics

### Zero, absence, and suppression

- `value: 0` with `dataStatus: AVAILABLE` is an observed zero from the source;
- `value: null` with `dataStatus: UNAVAILABLE` means no data is available;
- `value: null` with `dataStatus: SUPPRESSED` means the source suppressed the value;
- present values may also have `ESTIMATED` or `REVISED` status;
- a PostgreSQL constraint rejects inconsistent value/status combinations.

### Comparability

`comparisonGroupId` identifies observations sharing the same dataset, metric, citizenship, purpose, period, unit, and methodology version. The API rejects incompatible filters, and time series do not silently cross a change in units or methodology.

### Aggregation

When a source publishes multiple categories for the same destination and group, country detail preserves the individual classifications while the headline statistic aggregates only compatible observations. Missing and suppressed values remain distinct from zero.

### Freshness

The contract exposes `freshness` as `CURRENT` or `STALE`. The current implementation presents resolved observations and absences as `CURRENT`; an automatic aging policy has not yet been implemented.

## Official data ingestion

### Running ingestion jobs

Each command builds the application, downloads the official source, validates its content, creates or reuses a release, and atomically publishes approved data:

```bash
npm run ingest:eurostat
npm run ingest:uk-home-office
npm run ingest:ircc-canada
```

The UK Home Office CLI also accepts a pinned official asset:

```bash
npm run build
node dist/cli/ingest-uk-home-office.js \
  --source-url=https://assets.publishing.service.gov.uk/path/to/file.xlsx
```

The argument must use HTTPS and the `assets.publishing.service.gov.uk` host.

### Ingestion client safeguards

- expected external destinations are allowlisted or fixed in code;
- Eurostat requests time out after 30 seconds and XLSX requests after 60 seconds;
- Eurostat responses are limited to 5 MiB;
- IRCC workbooks are limited to 2 MiB and UK workbooks to 12 MiB;
- additional limits apply to expanded ZIP content;
- HTTP status, MIME type, workbook structure, worksheet, and headers are validated;
- citizenship, purpose, unit, metric, and period receive semantic validation;
- logs do not contain raw payloads or personal data.

Methodology, licensing, and exact source slices are documented in [`docs/data-sources.md`](docs/data-sources.md).

## Database

The main entities are:

- `Country`, `Citizenship`, and `VisaPurpose`: reference dimensions;
- `SourceOrganization` and `SourceDataset`: provenance;
- `DatasetRelease`: version, checksum, and the `STAGING → VERIFIED → PUBLISHED` or `REJECTED` lifecycle;
- `ComparisonGroup`: explicit comparability key;
- `MetricObservation`: value, status, unit, period, and original category;
- `VisaProgram` and `OfficialLink`: verified official content;
- `IngestionJob`: execution state and sanitized ingestion report.

### Migrations

```bash
npm run prisma:generate
npm run prisma:migrate
```

`prisma:migrate` uses `prisma migrate deploy`, which applies migrations already committed to the repository. The project does not provide a synthetic observation seed for development or production.

### Test environment

By default, tests derive a `public_test` schema from `DATABASE_URL`. You may set `TEST_DATABASE_URL`, but its database or schema name must contain `test`, and it cannot equal the development URL. This guard protects the development database from suite cleanup.

## Security and HTTP behavior

- request input is transformed and allowlisted; unknown fields are rejected;
- Helmet sets defensive HTTP headers;
- CORS is restricted to configured origins, `GET` methods, and no credentials;
- Prisma uses parameterized database queries;
- unexpected errors are sanitized, and all error responses use `Cache-Control: no-store`;
- `x-correlation-id` is propagated only if it uses safe characters and is at most 128 characters; otherwise, the server generates a UUID;
- successful responses use `Cache-Control: public, max-age=<ttl>, stale-while-revalidate=<ttl>`;
- rate limiting is per IP and returns `RateLimit-*` headers plus `Retry-After` on `429` responses;
- ingestion has no public route and applies network and content-size limits;
- authentication is not required because the current HTTP surface is public and read-only.

The rate limiter stores state in process memory. Multi-replica deployments should replace it with shared storage to enforce a consistent global limit. When deploying behind a proxy, configure proxy trust deliberately before relying on forwarded client IP addresses.

## Testing and quality

With local PostgreSQL available:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run contract:validate
npm audit --omit=dev
```

Available commands:

| Command                     | Purpose                                                |
| --------------------------- | ------------------------------------------------------ |
| `npm run start:dev`         | Start the server in watch mode                         |
| `npm run build`             | Compile the application into `dist/`                   |
| `npm start`                 | Run the compiled build                                 |
| `npm run format`            | Format supported files                                 |
| `npm run format:check`      | Check formatting without modifying files               |
| `npm run lint`              | Run ESLint                                             |
| `npm run typecheck`         | Run TypeScript without emitting a build                |
| `npm test`                  | Prepare the isolated database and run the entire suite |
| `npm run test:unit`         | Run unit tests                                         |
| `npm run test:integration`  | Run PostgreSQL integration tests                       |
| `npm run test:contract`     | Run HTTP contract tests                                |
| `npm run test:cov`          | Run the suite with coverage output                     |
| `npm run contract:validate` | Validate the OpenAPI 3.1 snapshot                      |

The suite covers, among other behaviors:

- response shape and behavior of all five public routes;
- search, pagination, and global country catalog synchronization;
- observed zero versus missing and suppressed data;
- default filters and incompatible dimensions;
- country details, verified programs, sources, and comparable series;
- adapters for all three official sources;
- idempotency, semantic rejection, atomic publication, and rollback;
- test-database safety;
- cache, rate-limit, and correlation-ID headers;
- the presence and use of critical database indexes through query plans.

This repository has no frontend. Playwright validation against a real backend belongs to the client integration workflow; the latest recorded result is in [`docs/validation/global-coverage.md`](docs/validation/global-coverage.md).

## Project structure

```text
.
├── contracts/                 # Shared OpenAPI snapshot
├── docs/                      # Sources, reports, and validation evidence
├── prisma/
│   ├── migrations/            # Versioned PostgreSQL migrations
│   └── schema.prisma          # Relational model
├── scripts/                   # Safe test setup and OpenAPI validation
├── src/
│   ├── cli/                   # Ingestion job entry points
│   ├── common/
│   │   ├── contracts/         # Public contract types
│   │   ├── database/          # Global Prisma service
│   │   ├── dto/               # Shared parameter validation
│   │   ├── errors/            # Domain errors and HTTP exception filter
│   │   └── http/              # Cache and rate limiting
│   ├── config/                # Environment validation
│   └── modules/
│       ├── countries/         # Country catalog and detail
│       ├── ingestion/         # Adapters, validation, and publication
│       ├── sources/           # Official provenance
│       ├── statistics/        # Map, defaults, and time series
│       └── visa-programs/     # Verified official programs
└── test/
    ├── contract/              # HTTP contract
    ├── integration/           # Database and internal flows
    ├── performance/           # Indexes and query plans
    ├── unit/                  # Adapters, clients, and safeguards
    └── fixtures/              # Synthetic test-only data
```

## OpenAPI contract

[`contracts/openapi.yaml`](contracts/openapi.yaml) is a versioned snapshot of the contract maintained in the client repository at:

```text
visa-atlas-client/specs/001-shared-api-contract/contracts/openapi.yaml
```

The client copy remains the source of truth. Route, payload, status, or semantic changes must be approved there and synchronized into this repository alongside the backend changes.

Validate the snapshot with:

```bash
npm run contract:validate
```

The project does not expose Swagger UI at runtime; consult the versioned YAML directly.

## Operations and limitations

- the public API is read-only and currently serves the initial `BRA / WORK` slice;
- the country catalog is global, but statistical availability depends on each source;
- the database starts without observations and requires official ingestion jobs;
- ingestion jobs are manual/internal; no scheduler or queue is included;
- no public health/readiness endpoint, Prometheus metrics, or distributed tracing is currently exposed;
- `freshness` does not yet apply an automatic staleness policy;
- rate-limit state is local to each application process;
- local Docker Compose packages only PostgreSQL, not the application;
- the repository does not currently declare its own license; third-party data retains the licenses and attribution documented in `docs/data-sources.md`.

For production, orchestrate migrations before rolling out a new version, inject secrets through the platform's secret-management mechanism, use managed PostgreSQL with backups, run ingestion in a controlled environment, and monitor job failures and the age of the latest published release.

## Additional documentation

- [`docs/data-sources.md`](docs/data-sources.md): sources, slices, methodology, licenses, and attribution;
- [`docs/validation/global-coverage.md`](docs/validation/global-coverage.md): latest global validation evidence and known risks;
- [`docs/ingestion-reports/uk-home-office/2026-06.md`](docs/ingestion-reports/uk-home-office/2026-06.md): controlled UK Home Office admission report;
- [`docs/ingestion-reports/ircc-canada/2024.md`](docs/ingestion-reports/ircc-canada/2024.md): controlled IRCC admission report;
- [`contracts/README.md`](contracts/README.md): contract snapshot policy;
- [`backend-standards-node-nestjs.md`](backend-standards-node-nestjs.md): backend engineering standards.
