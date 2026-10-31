# API protection runbook

## Scope and first response

This runbook covers Redis-backed rate limiting and response cache, the Nginx ingress, and PostgreSQL backpressure. PostgreSQL remains the source of truth. During an incident, preserve correlation IDs and aggregate metrics, but never copy Redis URLs, credentials, raw IPs, or cache values into tickets.

1. Confirm the public symptom: status distribution, p95/p99, and affected route group.
2. Check Nginx upstream errors, application `5xx`/`503`, Redis command failures/circuit state, and PostgreSQL connections/timeouts.
3. Stop a rollout when any stop condition in `api-protection-rollout.md` is met.
4. Apply the smallest independent rollback below and record start/end timestamps.

## Redis unavailable or command latency high

- Expected behavior: cache becomes a miss; distributed rate limiting fails open; Nginx continues burst protection; Redis commands remain bounded by `REDIS_COMMAND_TIMEOUT_MS` and the circuit breaker.
- Verify `redis.command_failed`, `redis.circuit_open`, `rate_limit.fallback`, cache errors, and database queue rejections. Do not restart every replica simultaneously.
- If database pressure is safe, keep the API online and investigate region/network/provider status.
- If PostgreSQL pressure rises, set `CACHE_ENABLED=false` only if corrupted/stale cache is suspected; otherwise retaining cache is safer. Reduce ingress at Nginx or scale the database before increasing application concurrency.
- If rate-limit Redis calls amplify latency, set `RATE_LIMIT_MODE=fallback` (or `RATE_LIMIT_ENABLED=false`) and retain Nginx limits.

## Provider quota or memory exhaustion

- At 70%, forecast month-end use and reduce nonessential cache cardinality.
- At 85%, freeze cache expansion and approve a paid tier or selective cache disablement.
- At 95%, execute the approved upgrade or disable selected cache groups before provider rejection.
- Any eviction spike with low memory headroom is an incident. Confirm every key has TTL and no raw identity appears in keys. Never use `KEYS` in production; use provider metrics or bounded `SCAN` only during an approved investigation.

## Cache inconsistency

1. Compare the published release identity in PostgreSQL with the release component in newly generated keys.
2. Set `CACHE_ENABLED=false` and redeploy/recreate replicas. Do not flush the entire Redis because rate-limit keys share the instance.
3. Verify the five public endpoints against PostgreSQL and the HTTP contract.
4. Fix release versioning or serialization before re-enabling one endpoint group at a time. Old namespaces expire naturally.

## Upstream or Nginx failure

- One failed API replica: Nginx passive failure handling should keep the other upstream serving. Remove only the failed replica, repair it, then verify it rejoins.
- Nginx configuration regression: revert the ingress release to the last known digest/config and keep API replicas private. A temporary direct route is allowed only through an authenticated/restricted deployment ingress; never publish container ports broadly.
- TLS/certificate incident: restore the prior certificate secret and reload gracefully. Do not bake private keys into images.

## PostgreSQL saturation

- Expected response is sanitized `503 DATABASE_CAPACITY_EXCEEDED` or `DATABASE_UNAVAILABLE`, never an unbounded wait.
- Check total connections against `DATABASE_GLOBAL_CONNECTION_BUDGET`, queue-full/queue-timeout events, and statement timeout counts.
- Do not raise `DATABASE_POOL_MAX` or query concurrency during an incident without recalculating the global budget. Prefer ingress reduction and cache recovery.

## Credential rotation

1. Create the replacement Redis credential in the secret manager and test it with a non-production smoke key with TTL.
2. Roll replicas gradually with the new `rediss://` secret; confirm `redis.ready` without exposing the URL.
3. Revoke the old credential only after all replicas and operational jobs have moved.
4. Rotating `RATE_LIMIT_IDENTITY_SECRET` resets identity namespaces. Schedule it as a controlled change and expect counters to restart.

## Independent rollback procedures and rehearsal evidence

Commands below use the local Compose topology; production uses the equivalent deployment configuration and change record.

```bash
CACHE_ENABLED=false docker compose up -d --force-recreate api-1 api-2 nginx
RATE_LIMIT_MODE=fallback docker compose up -d --force-recreate api-1 api-2 nginx
docker compose stop nginx
docker compose start nginx
docker compose up -d --force-recreate api-1 api-2 nginx
```

Rehearsed on 2026-10-31:

| Rollback                    | Evidence                                                                                    |                                    Recovery time |
| --------------------------- | ------------------------------------------------------------------------------------------- | -----------------------------------------------: |
| Cache off                   | both replicas reported `CACHE_ENABLED=false`; `/api/v1/stats/map` returned `200`            | 63 s including image/migration dependency checks |
| Redis rate limiter fallback | both replicas reported `RATE_LIMIT_MODE=fallback`; public map returned `200`                |                                           15.2 s |
| Nginx removal/recovery      | API remained `200` on its private listener while Nginx was stopped; public ingress restored |                                           5.82 s |

The rehearsal exposed and fixed a false-negative healthcheck: public endpoint health probes could receive `429`. Compose now checks the private TCP listener, so rate limiting cannot mark a healthy replica unhealthy.

## Closure

After recovery, restore the default configuration, verify both upstreams, zero unexpected `5xx`, Redis circuit closure, database headroom, and contract tests. Record timeline, sanitized metrics, cause, rollback used, and follow-up owner.
