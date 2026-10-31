import { validateEnvironment } from '../../src/config/environment.js';

const DATABASE_URL = 'postgresql://visa_atlas:visa_atlas@localhost:5432/visa_atlas';

describe('environment validation', () => {
  it('keeps Redis disabled by default with bounded safe defaults', () => {
    expect(validateEnvironment({ DATABASE_URL })).toMatchObject({
      REDIS_ENABLED: false,
      CACHE_ENABLED: false,
      CACHE_DEFAULT_TTL_SECONDS: 900,
      CACHE_MAX_ITEM_BYTES: 131_072,
      CACHE_TTL_JITTER_PERCENT: 10,
      CACHE_LOCK_TTL_MS: 2_000,
      CACHE_LOCK_WAIT_MS: 250,
      REDIS_URL: null,
      REDIS_CONNECT_TIMEOUT_MS: 1_000,
      REDIS_COMMAND_TIMEOUT_MS: 250,
      REDIS_KEY_PREFIX: 'visa-atlas:development',
      REDIS_CIRCUIT_FAILURE_THRESHOLD: 5,
      REDIS_CIRCUIT_RESET_MS: 10_000,
      REDIS_RECONNECT_MAX_DELAY_MS: 1_000,
      REDIS_RECONNECT_MAX_ATTEMPTS: 3,
      RATE_LIMIT_ENABLED: false,
      RATE_LIMIT_MODE: 'observe',
      RATE_LIMIT_IDENTITY_SECRET: null,
      RATE_LIMIT_HEAVY_MAX: 60,
      RATE_LIMIT_DAILY_MAX: 1_000,
      TRUST_PROXY: false,
    });
  });

  it('validates distributed rate limit modes, secret, and explicit proxy trust', () => {
    expect(
      validateEnvironment({
        DATABASE_URL,
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_MODE: 'enforce',
        RATE_LIMIT_IDENTITY_SECRET: 'test-secret-with-at-least-32-characters',
        TRUST_PROXY: 'loopback, 10.0.0.0/8',
      }),
    ).toMatchObject({
      RATE_LIMIT_ENABLED: true,
      RATE_LIMIT_MODE: 'enforce',
      TRUST_PROXY: 'loopback, 10.0.0.0/8',
    });
  });

  it.each([
    [{ RATE_LIMIT_ENABLED: 'true' }, 'RATE_LIMIT_IDENTITY_SECRET is required'],
    [{ RATE_LIMIT_MODE: 'disabled' }, 'RATE_LIMIT_MODE must be observe, enforce, or fallback'],
    [{ TRUST_PROXY: 'trusted\nspoof' }, 'TRUST_PROXY'],
    [{ TRUST_PROXY: 'true' }, 'TRUST_PROXY'],
    [{ TRUST_PROXY: '10.0.0.0/99' }, 'TRUST_PROXY'],
  ])('rejects invalid rate limit configuration %#', (rateLimitInput, message) => {
    expect(() => validateEnvironment({ DATABASE_URL, ...rateLimitInput })).toThrow(message);
  });

  it('requires a Redis URL when the integration is enabled', () => {
    expect(() => validateEnvironment({ DATABASE_URL, REDIS_ENABLED: 'true' })).toThrow(
      'REDIS_URL is required when REDIS_ENABLED is true',
    );
  });

  it('requires Redis and validates bounds when response caching is enabled', () => {
    expect(() => validateEnvironment({ DATABASE_URL, CACHE_ENABLED: 'true' })).toThrow(
      'REDIS_ENABLED must be true when CACHE_ENABLED is true',
    );
    expect(() => validateEnvironment({ DATABASE_URL, CACHE_TTL_JITTER_PERCENT: '51' })).toThrow(
      'CACHE_TTL_JITTER_PERCENT',
    );
    expect(() => validateEnvironment({ DATABASE_URL, CACHE_MAX_ITEM_BYTES: '0' })).toThrow(
      'CACHE_MAX_ITEM_BYTES',
    );
  });

  it('requires TLS for an enabled production Redis connection', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL,
        NODE_ENV: 'production',
        REDIS_ENABLED: 'true',
        REDIS_URL: 'redis://redis.example.test:6379',
      }),
    ).toThrow('REDIS_URL must use rediss:// in production');
  });

  it('accepts an enabled local Redis connection outside production', () => {
    expect(
      validateEnvironment({
        DATABASE_URL,
        NODE_ENV: 'test',
        REDIS_ENABLED: 'true',
        REDIS_URL: 'redis://127.0.0.1:6379',
        REDIS_KEY_PREFIX: 'visa-atlas:test',
      }),
    ).toMatchObject({
      NODE_ENV: 'test',
      REDIS_ENABLED: true,
      REDIS_URL: 'redis://127.0.0.1:6379',
      REDIS_KEY_PREFIX: 'visa-atlas:test',
    });
  });

  it.each([
    [{ REDIS_ENABLED: 'maybe' }, 'REDIS_ENABLED must be true or false'],
    [
      { REDIS_ENABLED: 'true', REDIS_URL: 'https://redis.example.test' },
      'REDIS_URL must use redis:// or rediss://',
    ],
    [{ REDIS_KEY_PREFIX: 'invalid prefix' }, 'REDIS_KEY_PREFIX'],
    [{ REDIS_COMMAND_TIMEOUT_MS: '0' }, 'REDIS_COMMAND_TIMEOUT_MS must be a positive integer'],
  ])('rejects invalid Redis configuration %#', (redisInput, message) => {
    expect(() => validateEnvironment({ DATABASE_URL, ...redisInput })).toThrow(message);
  });
});
