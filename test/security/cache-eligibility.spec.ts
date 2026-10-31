import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import type { CacheStampedeService } from '../../src/common/cache/cache-stampede.service.js';
import { RedisCacheService } from '../../src/common/cache/redis-cache.service.js';
import { ResourceNotFoundError } from '../../src/common/errors/domain.error.js';
import type { RedisService } from '../../src/common/redis/redis.service.js';

function createCache() {
  const get = jest.fn<RedisService['get']>().mockResolvedValue({ status: 'ok', value: null });
  const set = jest.fn<RedisService['set']>().mockResolvedValue({ status: 'ok', value: 'OK' });
  const stampede = {
    run: <T>(options: { load: () => Promise<T> }) => options.load(),
  } as unknown as CacheStampedeService;
  return {
    cache: new RedisCacheService(
      { get, set } as unknown as RedisService,
      stampede,
      new ConfigService({
        CACHE_ENABLED: true,
        CACHE_MAX_ITEM_BYTES: 32,
        CACHE_TTL_JITTER_PERCENT: 0,
        NODE_ENV: 'test',
      }),
    ),
    set,
  };
}

describe('cache eligibility security boundaries', () => {
  it.each([
    ['4xx domain response', new ResourceNotFoundError('Country')],
    ['5xx loader failure', new Error('database unavailable')],
  ])('never caches %s', async (_name, error) => {
    const { cache, set } = createCache();
    await expect(
      cache.getOrLoad({
        group: 'detail',
        route: 'country-detail',
        releaseVersion: 'release',
        query: { iso3: 'ZZZ' },
        load: () => Promise.reject(error),
      }),
    ).rejects.toBe(error);
    expect(set).not.toHaveBeenCalled();
  });

  it('does not write an oversized complete response', async () => {
    const { cache, set } = createCache();
    await expect(
      cache.getOrLoad({
        group: 'map',
        route: 'stats-map',
        releaseVersion: 'release',
        query: {},
        load: () => Promise.resolve({ data: 'x'.repeat(256) }),
      }),
    ).resolves.toEqual({ data: 'x'.repeat(256) });
    expect(set).not.toHaveBeenCalled();
  });
});
