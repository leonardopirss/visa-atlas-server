import { isIP } from 'node:net';

interface Environment {
  NODE_ENV: 'development' | 'test' | 'production';
  DATABASE_URL: string;
  PORT: number;
  CORS_ORIGINS: string;
  CACHE_TTL_SECONDS: number;
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

function positiveInteger(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
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
  const rateLimitEnabled = booleanValue(input.RATE_LIMIT_ENABLED, false, 'RATE_LIMIT_ENABLED');
  return {
    NODE_ENV: environment,
    DATABASE_URL: databaseUrl,
    PORT: positiveInteger(input.PORT, 3000, 'PORT'),
    CORS_ORIGINS:
      typeof input.CORS_ORIGINS === 'string' ? input.CORS_ORIGINS : 'http://localhost:5173',
    CACHE_TTL_SECONDS: positiveInteger(input.CACHE_TTL_SECONDS, 60, 'CACHE_TTL_SECONDS'),
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
