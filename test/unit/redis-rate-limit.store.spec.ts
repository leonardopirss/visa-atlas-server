import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import type { RateLimitPolicy } from '../../src/common/http/rate-limit.policy.js';
import {
  normalizeClientIdentity,
  RedisRateLimitStore,
} from '../../src/common/http/redis-rate-limit.store.js';
import type { RedisService } from '../../src/common/redis/redis.service.js';
import type { RedisOperationResult } from '../../src/common/redis/redis.types.js';

const SECRET = 'unit-test-secret-with-at-least-32-characters';
const policies: readonly RateLimitPolicy[] = [
  { name: 'global', limit: 120, windowMs: 60_000, burst: 120 },
  { name: 'daily', limit: 1_000, windowMs: 86_400_000, burst: 1_000 },
];

function createRedis(result: RedisOperationResult<unknown>) {
  const evalMock =
    jest.fn<
      (
        script: string,
        keys: readonly string[],
        args: readonly string[],
      ) => Promise<RedisOperationResult<unknown>>
    >();
  evalMock.mockResolvedValue(result);
  return {
    redis: { eval: evalMock } as unknown as RedisService,
    evalMock,
  };
}

describe('RedisRateLimitStore', () => {
  it('uses fixed-length hashed keys without storing the raw IP', async () => {
    const { redis, evalMock } = createRedis({
      status: 'ok',
      value: [1, 1, 119, 1_700_000_000_500, 0],
    });
    const store = new RedisRateLimitStore(
      redis,
      new ConfigService({ RATE_LIMIT_IDENTITY_SECRET: SECRET }),
    );

    await store.consume('203.0.113.42', policies);

    const keys = evalMock.mock.calls[0]?.[1] ?? [];
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(/^ratelimit:v1:global:[a-f0-9]{32}$/);
    expect(keys.join(':')).not.toContain('203.0.113.42');
  });

  it('passes mandatory bounded TTLs and GCRA intervals for every policy', async () => {
    const { redis, evalMock } = createRedis({
      status: 'ok',
      value: [1, 1, 119, 1_700_000_000_500, 0],
    });
    const store = new RedisRateLimitStore(
      redis,
      new ConfigService({ RATE_LIMIT_IDENTITY_SECRET: SECRET }),
    );

    await store.consume('2001:db8::1', policies);

    expect(evalMock.mock.calls[0]?.[2]).toEqual([
      '500',
      '120',
      '61000',
      '120',
      '86400',
      '1000',
      '86486400',
      '1000',
    ]);
  });

  it('maps atomic decisions and rejects malformed Redis responses safely', async () => {
    const { redis, evalMock } = createRedis({
      status: 'ok',
      value: [0, 2, 0, 1_700_000_100_000, 750],
    });
    const store = new RedisRateLimitStore(
      redis,
      new ConfigService({ RATE_LIMIT_IDENTITY_SECRET: SECRET }),
    );

    await expect(store.consume('127.0.0.1', policies)).resolves.toEqual({
      status: 'ok',
      decision: {
        allowed: false,
        limit: 1_000,
        remaining: 0,
        resetAtMs: 1_700_000_100_000,
        retryAfterMs: 750,
        policy: 'daily',
      },
    });

    evalMock.mockResolvedValueOnce({ status: 'ok', value: ['invalid'] });
    await expect(store.consume('127.0.0.1', policies)).resolves.toEqual({ status: 'fallback' });
  });

  it('fails open on Redis failure or absent identity secret', async () => {
    const { redis } = createRedis({ status: 'timeout' });
    const store = new RedisRateLimitStore(
      redis,
      new ConfigService({ RATE_LIMIT_IDENTITY_SECRET: SECRET }),
    );
    const unconfigured = new RedisRateLimitStore(redis, new ConfigService({}));

    await expect(store.consume('127.0.0.1', policies)).resolves.toEqual({ status: 'fallback' });
    await expect(unconfigured.consume('127.0.0.1', policies)).resolves.toEqual({
      status: 'fallback',
    });
  });

  it.each([
    ['::ffff:192.0.2.10', '192.0.2.10'],
    ['2001:DB8::1%eth0', '2001:db8::1'],
    ['2001:0db8:0:0:0:0:0:1', '2001:db8::1'],
    ['not-an-ip', 'unknown'],
  ])('normalizes %s without accepting arbitrary cardinality', (input, expected) => {
    expect(normalizeClientIdentity(input)).toBe(expected);
  });
});
