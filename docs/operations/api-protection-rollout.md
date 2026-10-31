# API protection rollout

## Preconditions

- [x] Local Nginx + two API replicas + Redis + PostgreSQL topology passed contract, security, failure, and load validation.
- [x] Cache and distributed rate limit can be disabled independently.
- [x] Runbook, dashboards/alerts specification, quota actions, and rollback evidence exist.
- [ ] Managed Redis exists in the same region as the backend with TLS, eviction, TTL-only data, and secret-manager credentials.
- [ ] Deployment destination, owner, maintenance window, dashboards, paging route, and last-known-good release are approved.

No production credentials or customer data may be used in tests. Record only aggregated, sanitized metrics.

## Progressive activation checklist

Each step requires a stable observation window and explicit go/no-go record before the next step.

1. **Connection dark:** deploy `REDIS_ENABLED=true`, `RATE_LIMIT_ENABLED=false`, `CACHE_ENABLED=false`; verify TLS, timeouts, circuit state, command budget, and no response change.
2. **Observe:** enable `RATE_LIMIT_ENABLED=true`, `RATE_LIMIT_MODE=observe`; compare would-block decisions, NAT/shared-IP false positives, headers, and quota use.
3. **Enforce:** set `RATE_LIMIT_MODE=enforce`; verify `429`, `Retry-After`, `RateLimit-*`, fallback behavior, and Nginx/app policy alignment.
4. **Cache by endpoint:** enable defaults, countries, map, detail, then timeseries separately; verify release freshness, hit ratio, bytes, PostgreSQL query reduction, and quota after each group.
5. **Nginx with one replica:** route a small traffic slice through Nginx, verify TLS, trusted proxy/IP handling, correlation IDs, methods/body/header limits, and rollback.
6. **Multiple replicas:** add the second replica, prove shared rate-limit decisions, round-robin/passive failover, pool budget, and no direct API exposure.
7. **Ingress closure:** route 100% through Nginx and block direct replica access at security-group/network-policy level. Verify externally from an untrusted network.

## Automatic stop conditions

Stop and roll back the most recent step on any of these conditions:

- HTTP contract mismatch or stale release under the current namespace;
- unexpected `5xx` > 1% for 5 minutes, cache-hit p95 >= 100 ms, or overall p99 >= 500 ms for 10 minutes;
- PostgreSQL connections > 80% of budget, sustained queue rejection/timeouts, or query volume regression;
- Redis command errors/fallback sustained for 5 minutes, eviction spike, memory/commands/bandwidth at 85%, or forecasted quota exhaustion;
- material false-positive `429`, fewer than two healthy replicas at the final stage, or any direct public access to an API replica.

## Managed Redis smoke test (T077)

Status: **pending external environment and authorization**.

When supplied, create a random smoke namespace, execute `PING`, `SET ... EX 60`, `GET`, one bounded EVAL used by the limiter, confirm TLS/certificate validation and TTL, then delete only the smoke key. Cap the test at 20 commands. Record region, latency percentiles, command count, memory delta, TTL, and sanitized result; never record the URL or credential.

## Rollout execution (T078)

Status: **pending deployment destination, managed Redis, dashboards, and change authorization**. Local Compose validation is not represented as real rollout. The operator must append timestamps, release/config versions, per-step metrics, decision, and rollback (if any).

## Post-observation review (T079)

Status: **pending at least seven stable days of target-environment traffic**. Review route mix, NAT false positives, p95/p99, cache hit ratio, query reduction, Redis commands/memory/bandwidth/evictions, PostgreSQL headroom, `429`, `503`, and unexpected `5xx`. Version approved changes in `src/config/environment.ts` and `.env.example`; do not tune from the local synthetic fixture alone.

## Local qualification record

On 2026-10-31, k6 0.55.0 pinned by digest exercised cold/warm cache, hot key, many keys, burst, forwarded-IP spoof attempts, and the offline path covered by the Redis degradation integration test. The explicit-percentile qualification run completed 152 HTTP requests: p50 29.02 ms, p95 101.97 ms, p99 452.17 ms, 22 expected `429`, and zero unexpected `5xx`. Warm-cache p95 was 38.42 ms. Redis used about 91 KiB additional memory in the preceding measured run with zero evictions; PostgreSQL remained at 3 connections. The mixed synthetic cache event ratio was 56.8% (100 hits/76 misses), while the >=80% criterion remains a seven-day target-environment gate.
