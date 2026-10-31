import { ConfigService } from '@nestjs/config';
import { createNodeRedisClient } from '../../src/common/redis/node-redis.client.js';
import { RedisService } from '../../src/common/redis/redis.service.js';

const redisTestUrl = process.env.REDIS_TEST_URL;
const describeRedis = redisTestUrl ? describe : describe.skip;

describeRedis('Redis integration', () => {
  const key = `foundation:${process.pid}:${Date.now()}`;
  let service: RedisService;

  beforeAll(async () => {
    service = new RedisService(
      new ConfigService({
        REDIS_ENABLED: true,
        REDIS_URL: redisTestUrl,
        REDIS_CONNECT_TIMEOUT_MS: 1_000,
        REDIS_COMMAND_TIMEOUT_MS: 250,
        REDIS_KEY_PREFIX: 'visa-atlas:integration',
        REDIS_CIRCUIT_FAILURE_THRESHOLD: 3,
        REDIS_CIRCUIT_RESET_MS: 100,
        REDIS_RECONNECT_MAX_DELAY_MS: 250,
        REDIS_RECONNECT_MAX_ATTEMPTS: 1,
      }),
      createNodeRedisClient,
    );
    await service.onModuleInit();
  });

  afterAll(async () => service.onModuleDestroy());

  it('connects, stores a TTL value, expires it, and shuts down', async () => {
    await expect(service.ping()).resolves.toEqual({ status: 'ok', value: 'PONG' });
    await expect(service.set(key, 'value', 100)).resolves.toEqual({
      status: 'ok',
      value: 'OK',
    });
    await expect(service.get(key)).resolves.toEqual({ status: 'ok', value: 'value' });

    const deadline = Date.now() + 1_000;
    let result = await service.get(key);
    while (result.status === 'ok' && result.value !== null && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      result = await service.get(key);
    }

    expect(result).toEqual({ status: 'ok', value: null });
  });
});
