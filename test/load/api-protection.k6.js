import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const baseUrl = __ENV.BASE_URL || 'http://host.docker.internal:3000';
const warmLatency = new Trend('warm_cache_latency', true);
const unexpected5xx = new Rate('unexpected_5xx');
const limited = new Counter('rate_limited');

export const options = {
  scenarios: {
    cold_cache: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 5,
      maxDuration: '10s',
      exec: 'coldCache',
    },
    warm_cache: {
      executor: 'constant-arrival-rate',
      rate: 4,
      timeUnit: '1s',
      duration: '8s',
      preAllocatedVUs: 2,
      startTime: '10s',
      exec: 'warmCache',
    },
    hot_key: { executor: 'constant-vus', vus: 2, duration: '8s', startTime: '20s', exec: 'hotKey' },
    many_keys: {
      executor: 'shared-iterations',
      vus: 2,
      iterations: 30,
      maxDuration: '12s',
      startTime: '30s',
      exec: 'manyKeys',
    },
    burst_per_ip: {
      executor: 'per-vu-iterations',
      vus: 30,
      iterations: 1,
      maxDuration: '10s',
      startTime: '44s',
      exec: 'burst',
    },
    multiple_client_hints: {
      executor: 'shared-iterations',
      vus: 4,
      iterations: 20,
      maxDuration: '10s',
      startTime: '56s',
      exec: 'multipleClients',
    },
    redis_offline: {
      executor: 'constant-arrival-rate',
      rate: 2,
      timeUnit: '1s',
      duration: '6s',
      preAllocatedVUs: 2,
      startTime: '68s',
      exec: 'redisOffline',
    },
  },
  thresholds: {
    warm_cache_latency: ['p(95)<100'],
    http_req_duration: ['p(99)<500'],
    unexpected_5xx: ['rate==0'],
  },
};

function record(response, allow429 = false) {
  if (response.status === 429) limited.add(1);
  unexpected5xx.add(response.status >= 500);
  check(response, {
    'expected status': (result) => result.status === 200 || (allow429 && result.status === 429),
  });
}

export function coldCache() {
  const response = http.get(`${baseUrl}/api/v1/countries?search=cold-${__ITER}&pageSize=30`);
  record(response);
  sleep(0.3);
}

export function warmCache() {
  const response = http.get(`${baseUrl}/api/v1/stats/map`);
  warmLatency.add(response.timings.duration);
  record(response);
}

export function hotKey() {
  record(http.get(`${baseUrl}/api/v1/filters/defaults`), true);
  sleep(0.4);
}

export function manyKeys() {
  record(http.get(`${baseUrl}/api/v1/countries?search=key-${__VU}-${__ITER}&pageSize=30`), true);
  sleep(0.25);
}

export function burst() {
  record(http.get(`${baseUrl}/api/v1/countries?pageSize=1`), true);
}

export function multipleClients() {
  record(
    http.get(`${baseUrl}/api/v1/countries?pageSize=1`, {
      headers: { 'X-Forwarded-For': `198.51.100.${__VU}` },
    }),
    true,
  );
  sleep(0.3);
}

export function redisOffline() {
  if (__ENV.REDIS_OFFLINE !== 'true') return;
  record(http.get(`${baseUrl}/api/v1/stats/map`), true);
}
