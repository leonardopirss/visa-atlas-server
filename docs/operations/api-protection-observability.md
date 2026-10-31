# API protection observability

## Dashboard

Use bounded labels only: environment, route group, status class, cache outcome, Redis operation/error kind, and upstream replica. Never label by IP, raw URL/query, correlation ID, cache key, country, or release ID.

| Panel           | Signals                                                                                    | Initial alert                                                         |
| --------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Public traffic  | request rate; `2xx`, `429`, `503`, unexpected `5xx`                                        | unexpected `5xx` > 1% for 5 min                                       |
| Latency         | p50/p95/p99 overall and by route group                                                     | cache-hit p95 >= 100 ms or overall p99 >= 500 ms for 10 min           |
| Rate limiting   | Nginx `429`, app decisions, observe/enforce delta, fallback count                          | fallback > 0 for 5 min; abrupt `429` increase above reviewed baseline |
| Cache           | hit/miss/bypass/error/oversize, bytes, operation latency                                   | hit ratio < 80% after 7 stable days; cache errors > 1% for 5 min      |
| Redis           | command latency/errors, circuit state, commands, memory, connections, bandwidth, evictions | any sustained command error; any eviction spike; memory > 85%         |
| PostgreSQL      | active/max connections, transaction/query rate, timeouts, queue depth/rejections           | > 80% connection budget or any sustained capacity rejection           |
| Nginx/upstreams | upstream response/error/timeouts and healthy replica count                                 | fewer than 2 healthy replicas or upstream `5xx` > 1%                  |

Hit ratio is `hit / (hit + miss)` and excludes intentional bypass/oversize. Query reduction must be compared with a matching uncached workload; Redis keyspace hits are not a substitute for cache-hit metrics because rate-limit operations share the instance.

## Free-tier quota alerts

The approved planning assumption is 500,000 Redis commands/month and 10 GB/month bandwidth. Confirm current provider limits at provisioning time.

| Level | Commands | Required action                                                                       |
| ----- | -------: | ------------------------------------------------------------------------------------- |
| 70%   |  350,000 | forecast month-end consumption, identify high-cardinality groups, assign owner        |
| 85%   |  425,000 | freeze cache expansion; approve upgrade or selective disablement before proceeding    |
| 95%   |  475,000 | execute upgrade/disablement immediately; halt rollout and protect rate-limit headroom |

Apply the same 70/85/95 percentages to memory and bandwidth when provider metrics expose them. Alert on forecasted exhaustion before month end as well as absolute use.

## SLO and rollout views

- Availability target: 99.5% monthly for the MVP; provider free tier is not treated as an SLA.
- Nominal test gates: cache-hit p95 < 100 ms, overall p99 < 500 ms, zero unexpected `5xx`, and unchanged HTTP contract.
- Seven-day gates: cache hit ratio >= 80% and repeated-workload PostgreSQL query reduction >= 70%.
- Every rollout panel must annotate deployment/config changes and expose the previous stable window for comparison.

Alerts route to the API on-call with links to `api-protection-runbook.md` and the rollout record. Acknowledgement does not replace the automatic stop conditions.
