import { ConfigService } from '@nestjs/config';
import type { RateLimitPolicy } from '../../src/common/http/rate-limit.policy.js';
import { RedisRateLimitStore } from '../../src/common/http/redis-rate-limit.store.js';
import { createNodeRedisClient } from '../../src/common/redis/node-redis.client.js';
import { RedisService } from '../../src/common/redis/redis.service.js';

const redisTestUrl = process.env.REDIS_TEST_URL;
const describeRedis = redisTestUrl ? describe : describe.skip;

describeRedis('distributed rate limit integration', () => {
  const prefix = `visa-atlas:rate-limit-integration:${process.pid}:${Date.now()}`;
  const identity = `192.0.2.${(process.pid % 200) + 1}`;
  const policy: RateLimitPolicy = {
    name: 'global',
    limit: 20,
    windowMs: 60_000,
    burst: 20,
  };
  let firstRedis: RedisService;
  let secondRedis: RedisService;
  let firstStore: RedisRateLimitStore;
  let secondStore: RedisRateLimitStore;

  beforeAll(async () => {
    const configuration = {
      REDIS_ENABLED: true,
      REDIS_URL: redisTestUrl,
      REDIS_CONNECT_TIMEOUT_MS: 1_000,
      REDIS_COMMAND_TIMEOUT_MS: 250,
      REDIS_KEY_PREFIX: prefix,
      REDIS_CIRCUIT_FAILURE_THRESHOLD: 3,
      REDIS_CIRCUIT_RESET_MS: 100,
      REDIS_RECONNECT_MAX_DELAY_MS: 250,
      REDIS_RECONNECT_MAX_ATTEMPTS: 1,
      RATE_LIMIT_IDENTITY_SECRET: 'integration-secret-with-at-least-32-characters',
    };
    firstRedis = new RedisService(new ConfigService(configuration), createNodeRedisClient);
    secondRedis = new RedisService(new ConfigService(configuration), createNodeRedisClient);
    await Promise.all([firstRedis.onModuleInit(), secondRedis.onModuleInit()]);
    firstStore = new RedisRateLimitStore(firstRedis, new ConfigService(configuration));
    secondStore = new RedisRateLimitStore(secondRedis, new ConfigService(configuration));
  });

  afterAll(async () => Promise.all([firstRedis.onModuleDestroy(), secondRedis.onModuleDestroy()]));

  it('enforces one atomic allowance across two application instances', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 21 }, (_unused, index) =>
        (index % 2 === 0 ? firstStore : secondStore).consume(identity, [policy]),
      ),
    );
    const allowed = decisions.filter((result) => result.status === 'ok' && result.decision.allowed);
    const denied = decisions.filter((result) => result.status === 'ok' && !result.decision.allowed);

    expect(allowed).toHaveLength(20);
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      status: 'ok',
      decision: { limit: 20, remaining: 0, policy: 'global' },
    });
  });
});
