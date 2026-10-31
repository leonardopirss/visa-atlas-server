import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import type { CacheStampedeService } from '../../src/common/cache/cache-stampede.service.js';
import { RedisCacheService } from '../../src/common/cache/redis-cache.service.js';
import type { RateLimitPolicy } from '../../src/common/http/rate-limit.policy.js';
import { RedisRateLimitStore } from '../../src/common/http/redis-rate-limit.store.js';
import { createNodeRedisClient } from '../../src/common/redis/node-redis.client.js';
import { RedisService } from '../../src/common/redis/redis.service.js';

const redisTestUrl = process.env.REDIS_TEST_URL;
const redisUrl = redisTestUrl ?? 'redis://127.0.0.1:0';
const describeRedis = redisTestUrl ? describe : describe.skip;

describeRedis('Redis keyspace security', () => {
  const namespace = `visa-atlas:keyspace:${process.pid}:${Date.now()}`;
  const identitySecret = 'keyspace-test-secret-with-at-least-32-characters';
  const policy: readonly RateLimitPolicy[] = [
    { name: 'global', limit: 120, windowMs: 60_000, burst: 120 },
  ];
  const raw = createClient({ url: redisUrl });
  let redis: RedisService;

  beforeAll(async () => {
    await raw.connect();
    redis = new RedisService(
      new ConfigService({
        REDIS_ENABLED: true,
        REDIS_URL: redisUrl,
        REDIS_KEY_PREFIX: namespace,
        REDIS_CONNECT_TIMEOUT_MS: 1_000,
        REDIS_COMMAND_TIMEOUT_MS: 250,
      }),
      createNodeRedisClient,
    );
    await redis.onModuleInit();
  });

  afterAll(async () => {
    const keys = await scanKeys(`${namespace}:*`);
    if (keys.length > 0) await raw.unlink(keys);
    await redis.onModuleDestroy();
    await raw.close();
  });

  async function scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const result = await raw.scan(cursor, { MATCH: pattern, COUNT: 200 });
      cursor = result.cursor;
      keys.push(...result.keys);
    } while (cursor !== '0');
    return keys;
  }

  it('keeps high-cardinality identities hashed, bounded, and expiring', async () => {
    const store = new RedisRateLimitStore(
      redis,
      new ConfigService({ RATE_LIMIT_IDENTITY_SECRET: identitySecret }),
    );
    await Promise.all(
      Array.from({ length: 100 }, (_, index) => store.consume(`198.51.100.${index}`, policy)),
    );

    const keys = await scanKeys(`${namespace}:ratelimit:*`);
    expect(keys).toHaveLength(100);
    expect(keys.every((key) => key.length <= namespace.length + 55)).toBe(true);
    expect(keys.join('|')).not.toContain('198.51.100.');
    const ttls = await Promise.all(keys.map((key) => raw.pTTL(key)));
    expect(ttls.every((ttl) => ttl > 0 && ttl <= 61_000)).toBe(true);
    const bytes = await Promise.all(keys.map((key) => raw.memoryUsage(key)));
    expect(bytes.reduce<number>((total, value) => total + (value ?? 0), 0)).toBeLessThan(32_768);
  });

  it('applies mandatory TTL to cache entries too', async () => {
    const stampede = { run: <T>(options: { load: () => Promise<T> }) => options.load() };
    const cache = new RedisCacheService(
      redis,
      stampede as unknown as CacheStampedeService,
      new ConfigService({
        CACHE_ENABLED: true,
        CACHE_MAX_ITEM_BYTES: 1_024,
        CACHE_TTL_JITTER_PERCENT: 0,
        NODE_ENV: 'test',
      }),
    );
    await expect(
      cache.set(
        'cache:test:v1:keyspace:release:query',
        { ok: true },
        {
          ttlSeconds: 1,
          maxBytes: 1_024,
        },
      ),
    ).resolves.toBe('stored');
    const ttl = await raw.pTTL(`${namespace}:cache:test:v1:keyspace:release:query`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1_000);
  });
});
