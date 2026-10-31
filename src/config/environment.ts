import { isIP } from 'node:net';

interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  DATABASE_POOL_MAX: number;
  DATABASE_REPLICA_COUNT: number;
  DATABASE_GLOBAL_CONNECTION_BUDGET: number;
  DATABASE_POOL_TIMEOUT_MS: number;
  DATABASE_STATEMENT_TIMEOUT_MS: number;
  DATABASE_QUERY_CONCURRENCY: number;
  DATABASE_QUERY_QUEUE_MAX: number;
  DATABASE_QUERY_QUEUE_TIMEOUT_MS: number;
  PORT: number;
  CORS_ORIGINS: string;
  CLOUDFLARE_ORIGIN_LOCK_ENABLED: boolean;
  CLOUDFLARE_ALLOWED_HOSTS: string;
  CLOUDFLARE_IP_RANGES: string;
  CACHE_TTL_SECONDS: number;
  CACHE_ENABLED: boolean;
  CACHE_DEFAULT_TTL_SECONDS: number;
  CACHE_MAX_ITEM_BYTES: number;
  CACHE_TTL_JITTER_PERCENT: number;
  CACHE_LOCK_TTL_MS: number;
  CACHE_LOCK_WAIT_MS: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_MAX: number;
  RATE_LIMIT_ENABLED: boolean;
  RATE_LIMIT_MODE: 'observe' | 'enforce' | 'fallback';
  RATE_LIMIT_IDENTITY_SECRET: string | null;
  RATE_LIMIT_HEAVY_MAX: number;
  RATE_LIMIT_DAILY_MAX: number;
  TRUST_PROXY: string | false;
  REDIS_ENABLED: boolean;
  REDIS_URL: string | null;
  REDIS_CONNECT_TIMEOUT_MS: number;
  REDIS_COMMAND_TIMEOUT_MS: number;
  REDIS_KEY_PREFIX: string;
  REDIS_CIRCUIT_FAILURE_THRESHOLD: number;
  REDIS_CIRCUIT_RESET_MS: number;
  REDIS_RECONNECT_MAX_DELAY_MS: number;
  REDIS_RECONNECT_MAX_ATTEMPTS: number;
}

function cloudflareOriginLock(
  input: Record<string, unknown>,
): Pick<
  Environment,
  'CLOUDFLARE_ORIGIN_LOCK_ENABLED' | 'CLOUDFLARE_ALLOWED_HOSTS' | 'CLOUDFLARE_IP_RANGES'
> {
  const enabled = booleanValue(
    input.CLOUDFLARE_ORIGIN_LOCK_ENABLED,
    false,
    'CLOUDFLARE_ORIGIN_LOCK_ENABLED',
  );
  const hosts =
    typeof input.CLOUDFLARE_ALLOWED_HOSTS === 'string'
      ? input.CLOUDFLARE_ALLOWED_HOSTS.split(',')
          .map((host) => host.trim().toLowerCase())
          .filter(Boolean)
      : [];
  const ranges =
    typeof input.CLOUDFLARE_IP_RANGES === 'string'
      ? input.CLOUDFLARE_IP_RANGES.split(',')
          .map((range) => range.trim())
          .filter(Boolean)
      : [];

  if (enabled && hosts.length === 0) {
    throw new Error('CLOUDFLARE_ALLOWED_HOSTS is required when origin lock is enabled');
  }
  if (
    hosts.some(
      (host) =>
        host.length > 253 ||
        !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
          host,
        ),
    )
  ) {
    throw new Error('CLOUDFLARE_ALLOWED_HOSTS must contain comma-separated hostnames');
  }
  if (enabled && ranges.length === 0) {
    throw new Error('CLOUDFLARE_IP_RANGES is required when origin lock is enabled');
  }
  if (
    ranges.some((range) => {
      const [address, prefix, extra] = range.split('/');
      const version = isIP(address ?? '');
      const parsedPrefix = Number(prefix);
      return (
        version === 0 ||
        prefix === undefined ||
        extra !== undefined ||
        !Number.isInteger(parsedPrefix) ||
        parsedPrefix < 0 ||
        parsedPrefix > (version === 4 ? 32 : 128)
      );
    })
  ) {
    throw new Error('CLOUDFLARE_IP_RANGES must contain valid comma-separated CIDR ranges');
  }

  return {
    CLOUDFLARE_ORIGIN_LOCK_ENABLED: enabled,
    CLOUDFLARE_ALLOWED_HOSTS: hosts.join(','),
    CLOUDFLARE_IP_RANGES: ranges.join(','),
  };
}

function positiveInteger(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  name: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function percentage(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 50) {
    throw new Error(`${name} must be an integer between 0 and 50`);
  }
  return parsed;
}

function booleanValue(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

function nodeEnvironment(value: unknown): Environment['NODE_ENV'] {
  if (value === undefined) return 'development';
  if (value === 'development' || value === 'test' || value === 'production') return value;
  throw new Error('NODE_ENV must be development, test, or production');
}

function redisUrl(
  value: unknown,
  enabled: boolean,
  environment: Environment['NODE_ENV'],
): string | null {
  if (value === undefined || value === '') {
    if (enabled) throw new Error('REDIS_URL is required when REDIS_ENABLED is true');
    return null;
  }
  if (typeof value !== 'string') throw new Error('REDIS_URL must be a string');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid Redis connection URL');
  }
  if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use redis:// or rediss://');
  }
  if (!parsed.hostname) throw new Error('REDIS_URL must include a hostname');
  if (enabled && environment === 'production' && parsed.protocol !== 'rediss:') {
    throw new Error('REDIS_URL must use rediss:// in production');
  }
  return value;
}

function redisKeyPrefix(value: unknown, environment: Environment['NODE_ENV']): string {
  const prefix = value === undefined ? `visa-atlas:${environment}` : value;
  if (
    typeof prefix !== 'string' ||
    prefix.length < 1 ||
    prefix.length > 64 ||
    !/^[A-Za-z0-9:_-]+$/.test(prefix)
  ) {
    throw new Error(
      'REDIS_KEY_PREFIX must use 1-64 letters, numbers, colons, underscores, or hyphens',
    );
  }
  return prefix.replace(/:+$/, '');
}

function rateLimitMode(value: unknown): Environment['RATE_LIMIT_MODE'] {
  if (value === undefined) return 'observe';
  if (value === 'observe' || value === 'enforce' || value === 'fallback') return value;
  throw new Error('RATE_LIMIT_MODE must be observe, enforce, or fallback');
}

function rateLimitSecret(value: unknown, enabled: boolean): string | null {
  if (value === undefined || value === '') {
    if (enabled)
      throw new Error('RATE_LIMIT_IDENTITY_SECRET is required when rate limiting is enabled');
    return null;
  }
  if (typeof value !== 'string' || value.length < 32 || value.length > 256) {
    throw new Error('RATE_LIMIT_IDENTITY_SECRET must contain 32-256 characters');
  }
  return value;
}

function trustProxy(value: unknown): string | false {
  if (value === undefined || value === false || value === 'false' || value === '') return false;
  if (typeof value !== 'string' || value.length > 256 || /[\r\n]/.test(value)) {
    throw new Error('TRUST_PROXY must be false or a bounded Express trust proxy value');
  }
  const validNames = new Set(['loopback', 'linklocal', 'uniquelocal']);
  const entries = value.split(',').map((entry) => entry.trim());
  if (
    entries.some((entry) => {
      if (validNames.has(entry)) return false;
      const [address, prefix, extra] = entry.split('/');
      const version = isIP(address ?? '');
      if (version === 0 || extra !== undefined) return true;
      if (prefix === undefined) return false;
      const parsedPrefix = Number(prefix);
      return (
        !Number.isInteger(parsedPrefix) ||
        parsedPrefix < 0 ||
        parsedPrefix > (version === 4 ? 32 : 128)
      );
    })
  ) {
    throw new Error('TRUST_PROXY must contain only named, IP, or CIDR proxy ranges');
  }
  return value;
}

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const databaseUrl = input.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  const environment = nodeEnvironment(input.NODE_ENV);
  const redisEnabled = booleanValue(input.REDIS_ENABLED, false, 'REDIS_ENABLED');
  const cacheEnabled = booleanValue(input.CACHE_ENABLED, false, 'CACHE_ENABLED');
  const rateLimitEnabled = booleanValue(input.RATE_LIMIT_ENABLED, false, 'RATE_LIMIT_ENABLED');
  const originLock = cloudflareOriginLock(input);
  const databasePoolMax = boundedInteger(input.DATABASE_POOL_MAX, 5, 'DATABASE_POOL_MAX', 1, 50);
  const databaseReplicaCount = boundedInteger(
    input.DATABASE_REPLICA_COUNT,
    1,
    'DATABASE_REPLICA_COUNT',
    1,
    20,
  );
  const databaseGlobalConnectionBudget = boundedInteger(
    input.DATABASE_GLOBAL_CONNECTION_BUDGET,
    20,
    'DATABASE_GLOBAL_CONNECTION_BUDGET',
    1,
    500,
  );
  if (databasePoolMax * databaseReplicaCount > databaseGlobalConnectionBudget) {
    throw new Error(
      'DATABASE_POOL_MAX multiplied by DATABASE_REPLICA_COUNT exceeds DATABASE_GLOBAL_CONNECTION_BUDGET',
    );
  }
  if (cacheEnabled && !redisEnabled) {
    throw new Error('REDIS_ENABLED must be true when CACHE_ENABLED is true');
  }
  return {
    NODE_ENV: environment,
    DATABASE_URL: databaseUrl,
    DATABASE_POOL_MAX: databasePoolMax,
    DATABASE_REPLICA_COUNT: databaseReplicaCount,
    DATABASE_GLOBAL_CONNECTION_BUDGET: databaseGlobalConnectionBudget,
    DATABASE_POOL_TIMEOUT_MS: boundedInteger(
      input.DATABASE_POOL_TIMEOUT_MS,
      2_000,
      'DATABASE_POOL_TIMEOUT_MS',
      100,
      30_000,
    ),
    DATABASE_STATEMENT_TIMEOUT_MS: boundedInteger(
      input.DATABASE_STATEMENT_TIMEOUT_MS,
      5_000,
      'DATABASE_STATEMENT_TIMEOUT_MS',
      100,
      60_000,
    ),
    DATABASE_QUERY_CONCURRENCY: boundedInteger(
      input.DATABASE_QUERY_CONCURRENCY,
      2,
      'DATABASE_QUERY_CONCURRENCY',
      1,
      50,
    ),
    DATABASE_QUERY_QUEUE_MAX: boundedInteger(
      input.DATABASE_QUERY_QUEUE_MAX,
      8,
      'DATABASE_QUERY_QUEUE_MAX',
      0,
      1_000,
    ),
    DATABASE_QUERY_QUEUE_TIMEOUT_MS: boundedInteger(
      input.DATABASE_QUERY_QUEUE_TIMEOUT_MS,
      250,
      'DATABASE_QUERY_QUEUE_TIMEOUT_MS',
      10,
      30_000,
    ),
    PORT: positiveInteger(input.PORT, 3000, 'PORT'),
    CORS_ORIGINS:
      typeof input.CORS_ORIGINS === 'string' ? input.CORS_ORIGINS : 'http://localhost:5173',
    ...originLock,
    CACHE_TTL_SECONDS: positiveInteger(input.CACHE_TTL_SECONDS, 60, 'CACHE_TTL_SECONDS'),
    CACHE_ENABLED: cacheEnabled,
    CACHE_DEFAULT_TTL_SECONDS: positiveInteger(
      input.CACHE_DEFAULT_TTL_SECONDS,
      900,
      'CACHE_DEFAULT_TTL_SECONDS',
    ),
    CACHE_MAX_ITEM_BYTES: positiveInteger(
      input.CACHE_MAX_ITEM_BYTES,
      131_072,
      'CACHE_MAX_ITEM_BYTES',
    ),
    CACHE_TTL_JITTER_PERCENT: percentage(
      input.CACHE_TTL_JITTER_PERCENT,
      10,
      'CACHE_TTL_JITTER_PERCENT',
    ),
    CACHE_LOCK_TTL_MS: positiveInteger(input.CACHE_LOCK_TTL_MS, 2_000, 'CACHE_LOCK_TTL_MS'),
    CACHE_LOCK_WAIT_MS: positiveInteger(input.CACHE_LOCK_WAIT_MS, 250, 'CACHE_LOCK_WAIT_MS'),
    RATE_LIMIT_TTL_MS: positiveInteger(input.RATE_LIMIT_TTL_MS, 60_000, 'RATE_LIMIT_TTL_MS'),
    RATE_LIMIT_MAX: positiveInteger(input.RATE_LIMIT_MAX, 120, 'RATE_LIMIT_MAX'),
    RATE_LIMIT_ENABLED: rateLimitEnabled,
    RATE_LIMIT_MODE: rateLimitMode(input.RATE_LIMIT_MODE),
    RATE_LIMIT_IDENTITY_SECRET: rateLimitSecret(input.RATE_LIMIT_IDENTITY_SECRET, rateLimitEnabled),
    RATE_LIMIT_HEAVY_MAX: positiveInteger(input.RATE_LIMIT_HEAVY_MAX, 60, 'RATE_LIMIT_HEAVY_MAX'),
    RATE_LIMIT_DAILY_MAX: positiveInteger(
      input.RATE_LIMIT_DAILY_MAX,
      1_000,
      'RATE_LIMIT_DAILY_MAX',
    ),
    TRUST_PROXY: trustProxy(input.TRUST_PROXY),
    REDIS_ENABLED: redisEnabled,
    REDIS_URL: redisUrl(input.REDIS_URL, redisEnabled, environment),
    REDIS_CONNECT_TIMEOUT_MS: positiveInteger(
      input.REDIS_CONNECT_TIMEOUT_MS,
      1_000,
      'REDIS_CONNECT_TIMEOUT_MS',
    ),
    REDIS_COMMAND_TIMEOUT_MS: positiveInteger(
      input.REDIS_COMMAND_TIMEOUT_MS,
      250,
      'REDIS_COMMAND_TIMEOUT_MS',
    ),
    REDIS_KEY_PREFIX: redisKeyPrefix(input.REDIS_KEY_PREFIX, environment),
    REDIS_CIRCUIT_FAILURE_THRESHOLD: positiveInteger(
      input.REDIS_CIRCUIT_FAILURE_THRESHOLD,
      5,
      'REDIS_CIRCUIT_FAILURE_THRESHOLD',
    ),
    REDIS_CIRCUIT_RESET_MS: positiveInteger(
      input.REDIS_CIRCUIT_RESET_MS,
      10_000,
      'REDIS_CIRCUIT_RESET_MS',
    ),
    REDIS_RECONNECT_MAX_DELAY_MS: positiveInteger(
      input.REDIS_RECONNECT_MAX_DELAY_MS,
      1_000,
      'REDIS_RECONNECT_MAX_DELAY_MS',
    ),
    REDIS_RECONNECT_MAX_ATTEMPTS: positiveInteger(
      input.REDIS_RECONNECT_MAX_ATTEMPTS,
      3,
      'REDIS_RECONNECT_MAX_ATTEMPTS',
    ),
  };
}
