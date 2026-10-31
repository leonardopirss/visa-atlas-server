# Quickstart: Redis foundation and distributed rate limiting

**Feature:** `005-api-protection-cache-proxy`  
**Phases:** 2 — shared Redis foundation; 3 — distributed rate limiting  
**Updated:** 2026-10-31

## Scope

Phase 2 added an optional Redis connection, bounded command execution, reconnection policy, circuit breaker, sanitized structured logs, and lifecycle shutdown. Phase 3 now moves application rate limiting to an atomic Redis store; response caching remains out of scope until Phase 4.

## Local services

```bash
docker compose up -d postgres redis
docker compose ps
```

The local Redis container:

- uses `redis:8.4-alpine` pinned to digest `sha256:3e393dc9c57e628ebd5e0fc0bc4524f83632b6b873503d619e856af9322d4ef7`;
- has a 256 MiB Redis memory limit and 320 MiB container limit;
- uses `volatile-lru` so only TTL keys are eviction candidates;
- disables persistence and stores `/data` in tmpfs;
- is not a production configuration.

## Run with Redis disabled

Redis is disabled by default, preserving the existing HTTP behavior:

```bash
REDIS_ENABLED=false npm run start:dev
```

The application must start without creating a Redis client.

## Run with local Redis enabled

```bash
REDIS_ENABLED=true \
REDIS_URL=redis://127.0.0.1:6379 \
REDIS_KEY_PREFIX=visa-atlas:development \
npm run start:dev
```

Expected structured events include `redis.ready` and `redis.connected`. Logs never include the connection URL or error message text because either could contain credentials.

## Production configuration

```dotenv
REDIS_ENABLED=true
REDIS_URL=rediss://<user>:<password>@<host>:<port>
REDIS_CONNECT_TIMEOUT_MS=1000
REDIS_COMMAND_TIMEOUT_MS=250
REDIS_KEY_PREFIX=visa-atlas:production
REDIS_CIRCUIT_FAILURE_THRESHOLD=5
REDIS_CIRCUIT_RESET_MS=10000
REDIS_RECONNECT_MAX_DELAY_MS=1000
REDIS_RECONNECT_MAX_ATTEMPTS=3
```

The value of `REDIS_URL` belongs in the deployment secret manager, not in a committed `.env` file. Production validation rejects `redis://`; TLS via `rediss://` is mandatory.

## Tests

Unit tests:

```bash
node --env-file-if-exists=.env \
  --experimental-vm-modules \
  ./node_modules/jest/bin/jest.js \
  --runInBand \
  test/unit/environment.spec.ts \
  test/unit/redis.service.spec.ts
```

Integration test against the local Redis container:

```bash
REDIS_TEST_URL=redis://127.0.0.1:6379 \
node --env-file-if-exists=.env \
  --experimental-vm-modules \
  ./node_modules/jest/bin/jest.js \
  --runInBand \
  test/integration/redis.spec.ts
```

The integration test verifies connection, `PING`, a TTL-backed write/read, expiration, and clean shutdown. It is skipped when `REDIS_TEST_URL` is absent so the regular suite does not silently connect to an arbitrary Redis.

## Controlled degradation

- Redis disabled: operations return `disabled` without a connection attempt.
- Client unavailable: operations return `unavailable`.
- Command deadline exceeded: operations return `timeout` and abort the command.
- Failure threshold reached: operations return `circuit-open` until the half-open interval.
- Offline queue is disabled, preventing delayed command accumulation.
- Only sanitized error type, operation, duration, and lifecycle event are logged.

## Phase 2 verification record

Executed on 2026-10-31:

- targeted environment and Redis unit tests: passed;
- Redis integration test with `redis:8.4-alpine`: passed;
- full Jest suite: 21 suites and 70 tests passed;
- application startup with Redis disabled: passed; `/filters/defaults` returned `200`;
- application startup with Redis enabled: passed; Redis connected and `/filters/defaults` returned `200`;
- ESLint: passed;
- TypeScript typecheck: passed;
- production build: passed;
- OpenAPI validation: passed and unchanged by this phase;
- production dependency audit: zero vulnerabilities.

The startup smoke tests used a disposable `visa_atlas_redis_test` database. It was dropped after validation, and the local PostgreSQL/Redis containers were stopped.

## Phase 3 — distributed rate limiting

The application limiter now uses one atomic GCRA `EVAL` per request. A single evaluation applies the global, heavy-route, and daily policies as applicable. Redis keys contain only the environment prefix, policy version/name, and a fixed-length HMAC of the normalized client IP; raw IP addresses are never stored.

Initial policies:

- all public endpoints: 120 requests/minute per IP;
- `/stats/map`, country detail, and timeseries: 60 requests/minute per IP;
- all public endpoints: 1,000 requests/day per IP.

### Configuration and rollout

Generate `RATE_LIMIT_IDENTITY_SECRET` in the deployment secret manager. It must be 32–256 characters and must not be committed or shared with the frontend.

Start in observe mode:

```dotenv
REDIS_ENABLED=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MODE=observe
RATE_LIMIT_IDENTITY_SECRET=<secret-manager-value>
RATE_LIMIT_MAX=120
RATE_LIMIT_TTL_MS=60000
RATE_LIMIT_HEAVY_MAX=60
RATE_LIMIT_DAILY_MAX=1000
```

After observing false positives and Redis health, change `RATE_LIMIT_MODE=enforce`. `observe` evaluates and emits the same headers but never returns `429`. `enforce` returns the documented `429` when the atomic decision denies the request.

Redis failure is fail-open and emits the structured `rate_limit.fallback` event. The circuit breaker and command timeout still bound the failure path. Nginx burst protection is required before production enforcement.

### Trusted proxy

`TRUST_PROXY=false` is the default. Do not accept `X-Forwarded-For` until Nginx is the only ingress. At that point configure only the exact trusted hop or private CIDR, for example:

```dotenv
TRUST_PROXY=10.20.0.0/16
```

Named Express ranges (`loopback`, `linklocal`, `uniquelocal`), IPs, and CIDRs are accepted. Arbitrary values and invalid CIDRs are rejected at startup.

### Rollback

The in-memory `Map` limiter was removed. Roll back the distributed decision path without restarting Redis by setting either:

```dotenv
RATE_LIMIT_MODE=fallback
```

or `RATE_LIMIT_ENABLED=false`. Both stop Redis rate-limit commands, preserve the response headers, and fail open. They do not restore a per-process counter, so Nginx protection must remain active.

### Phase 3 verification record

Executed on 2026-10-31 with local PostgreSQL 17 and Redis 8.4:

- two independently connected stores shared one atomic allowance under concurrent requests;
- unit tests covered policy groups, HMAC keys, mandatory TTL arguments, observe/enforce/fallback modes, environment validation, and safe IP normalization;
- HTTP contract test preserved `429`, `Retry-After`, `RateLimit-*`, `Cache-Control: no-store`, and the error body;
- full Jest suite: 23 suites and 88 tests passed;
- ESLint, TypeScript typecheck, production build, format check, and OpenAPI validation passed.

## Phase 5 — Nginx boundary and two API replicas

The local topology exposes `http://127.0.0.1:3000` through Nginx. `api-1` and `api-2` expose port 3000 only inside the internal `backend` Docker network and do not publish host ports. PostgreSQL and Redis are available to local development tools only through loopback bindings; the additional `devtools` network is local-only and must not be reproduced as a public production network.

Start and verify the topology:

```bash
docker compose up -d --build
npm run nginx:validate
npm run test:nginx
```

`nginx:validate` checks Compose invariants and runs `nginx -t` as UID/GID 101 in an isolated container. `test:nginx` verifies round-robin distribution through structured logs, passive failover, upstream recovery, forwarding-header spoof attempts, rejected methods/bodies, oversized URI/headers, burst `429`, and private replica ports.

### Boundary policy

- Nginx accepts only `GET`, `HEAD`, and `OPTIONS`; other methods return `405`.
- Bodies and transfer-encoded requests return `413`.
- Per-IP limiting starts at 5 requests/second with burst 10; the virtual-host ceiling is 100 requests/second with burst 50. Both return `429`.
- Incoming `X-Forwarded-For` and `X-Real-IP` are overwritten with the direct peer address. A bounded safe correlation ID is preserved; invalid values are replaced by Nginx's request ID.
- Upstreams use round-robin, 32 keep-alive connections, bounded connect/read/send timeouts, two passive retries, `max_fails=2`, and `fail_timeout=5s`.
- Nginx runs read-only as UID/GID 101 with temporary paths on tmpfs. Version tokens are disabled, internal upstream addresses remain only in logs, and sticky sessions/proxy caching are not enabled.

### Local versus production TLS

The checked-in Compose topology is explicitly `NODE_ENV=development`: Redis uses plaintext only on the private local Docker network and Nginx listens on HTTP port 8080 behind the host mapping. It is not a production deployment manifest.

Production must use `NODE_ENV=production`, `rediss://` for Redis, and one of these approved TLS boundaries:

1. Terminate TLS in Nginx with certificates supplied by the deployment secret store or an ACME-managed volume outside the repository; configure renewal and reload without replacing active connections.
2. Terminate TLS in a managed load balancer immediately before Nginx, keep that hop on a private trusted network, restrict ingress to the load balancer, and use a deployment-specific trusted forwarded-protocol configuration.

Private keys, certificate bundles, provider credentials, and real rate-limit secrets must never be committed or baked into images. In production, remove loopback database/Redis publications and the `devtools` network, expose only the TLS boundary, and keep the API replicas exclusively on the private backend network.

### Phase 5 verification record

Executed on 2026-10-31 with pinned Node 24 Alpine, Nginx 1.28 Alpine, PostgreSQL 17, and Redis 8.4 images:

- Nginx syntax and all scripted topology invariants passed;
- topology/security suite: 2 suites and 7 tests passed against the real Compose stack;
- round-robin used both upstreams; stopping `api-1` did not interrupt requests, and the replica rejoined after recovery;
- burst, method, body, URI/header, spoofing, and private-port checks passed;
- existing suite: 28 suites and 106 tests passed; the 2 Nginx suites are intentionally gated behind `NGINX_TEST_URL` and were run separately;
- ESLint, TypeScript typecheck, format check, production build, and OpenAPI validation passed.
- production dependency audit reported zero vulnerabilities.

## Phase 4 — Redis response cache

The five public GET operations are explicitly allow-listed in their domain services. Cache keys contain the environment, API contract version, logical route, a fixed-length published-release version, and the hash of the canonical validated query. Raw query values are not placed in Redis keys.

Initial policy:

| Group | TTL | Maximum item |
| --- | ---: | ---: |
| defaults | 5 minutes | 16 KiB |
| countries | 6 hours | 128 KiB |
| map | 15 minutes | 128 KiB |
| detail | 15 minutes | 128 KiB |
| timeseries | 30 minutes | 128 KiB |

All TTLs receive 10% jitter. Only successfully returned DTOs are written; loader errors, invalid serialization, oversized values, timeouts, eviction, and Redis failures become misses and never replace PostgreSQL as the source of truth.

### Configuration and rollback

Keep the cache disabled while deploying the code and Redis connection, then enable it independently:

```dotenv
REDIS_ENABLED=true
CACHE_ENABLED=true
CACHE_DEFAULT_TTL_SECONDS=900
CACHE_MAX_ITEM_BYTES=131072
CACHE_TTL_JITTER_PERCENT=10
CACHE_LOCK_TTL_MS=2000
CACHE_LOCK_WAIT_MS=250
```

`CACHE_ENABLED=true` is rejected unless Redis is also enabled. Roll back the cache path with `CACHE_ENABLED=false`; distributed rate limiting can remain enabled.

Single-flight coalesces concurrent work inside one replica. A short Redis owner-token lock coordinates hot misses across replicas. Lock contention waits only for `CACHE_LOCK_WAIT_MS`; orphaned locks expire after `CACHE_LOCK_TTL_MS`, and release uses compare-and-delete so one owner cannot remove another owner's lock.

Publishing or rolling back a dataset refreshes the shared published-release identity after the database transaction. New requests therefore use a new namespace immediately; old entries are not scanned or deleted and disappear through TTL/eviction.

### Phase 4 verification record

Executed on 2026-10-31 with local PostgreSQL 17 and Redis 8.4:

- unit tests covered canonical queries, stable hashes, environment/version isolation, TTL jitter, size/serialization limits, loader errors, local single-flight, bounded distributed lock wait, orphan recovery, and safe owner-token release;
- integration tests proved warm hits avoid domain queries, TTL expiration, Redis-offline fallback to PostgreSQL, and immediate namespace changes for publish and rollback;
- contract tests preserved response text/property ordering, status, content type, and `Cache-Control`; ETag was not added because the approved contract does not require it;
- full Jest suite: 28 suites and 106 tests passed;
- ESLint, TypeScript typecheck, production build, format check, and OpenAPI validation passed.
