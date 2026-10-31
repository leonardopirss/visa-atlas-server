import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import type { CacheStampedeService } from '../../src/common/cache/cache-stampede.service.js';
import { RedisCacheService } from '../../src/common/cache/redis-cache.service.js';
import type { RedisService } from '../../src/common/redis/redis.service.js';

function createService(overrides: Record<string, unknown> = {}) {
  const get = jest.fn<RedisService['get']>();
  const set = jest.fn<RedisService['set']>();
  get.mockResolvedValue({ status: 'ok', value: null });
  set.mockResolvedValue({ status: 'ok', value: 'OK' });
  const redis = { get, set } as unknown as RedisService;
  const stampede = { run: jest.fn() } as unknown as CacheStampedeService;
  const service = new RedisCacheService(
    redis,
    stampede,
    new ConfigService({
      CACHE_ENABLED: true,
      CACHE_MAX_ITEM_BYTES: 128,
      CACHE_TTL_JITTER_PERCENT: 10,
      NODE_ENV: 'test',
      ...overrides,
    }),
  );
  return { service, get, set, stampede };
}

describe('RedisCacheService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('deserializes hits and treats misses or malformed values as misses', async () => {
    const { service, get } = createService();
    get.mockResolvedValueOnce({ status: 'ok', value: '{"ok":true}' });
    await expect(service.get<{ ok: boolean }>('key')).resolves.toEqual({ ok: true });

    get.mockResolvedValueOnce({ status: 'ok', value: null });
    await expect(service.get('key')).resolves.toBeUndefined();

    get.mockResolvedValueOnce({ status: 'ok', value: '{invalid' });
    await expect(service.get('key')).resolves.toBeUndefined();
  });

  it('applies bounded TTL jitter and serializes a valid value', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const { service, set } = createService();
    await expect(
      service.set('key', { ok: true }, { ttlSeconds: 100, maxBytes: 128 }),
    ).resolves.toBe('stored');
    expect(set).toHaveBeenCalledWith('key', '{"ok":true}', 110_000);
  });

  it('rejects oversize, error, undefined, and unserializable values', async () => {
    const { service, set } = createService();
    await expect(
      service.set('key', { payload: 'x'.repeat(200) }, { ttlSeconds: 10, maxBytes: 16 }),
    ).resolves.toBe('oversize');
    await expect(service.set('key', new Error('do not cache'))).resolves.toBe('invalid');
    await expect(service.set('key', undefined)).resolves.toBe('invalid');
    await expect(service.set('key', 1n)).resolves.toBe('invalid');
    expect(set).not.toHaveBeenCalled();
  });

  it('treats Redis failures as misses without leaking them', async () => {
    const { service, get, set } = createService();
    get.mockResolvedValueOnce({ status: 'timeout' });
    set.mockResolvedValueOnce({ status: 'unavailable' });
    await expect(service.get('key')).resolves.toBeUndefined();
    await expect(service.set('key', { ok: true })).resolves.toBe('unavailable');
  });

  it('never writes a loader error', async () => {
    const { service, set, stampede } = createService();
    jest
      .spyOn(stampede, 'run')
      .mockImplementation((options: { load: () => Promise<unknown> }) => options.load());

    await expect(
      service.getOrLoad({
        group: 'map',
        route: 'stats-map',
        releaseVersion: 'release',
        query: {},
        load: () => Promise.reject(new Error('domain failure')),
      }),
    ).rejects.toThrow('domain failure');
    expect(set).not.toHaveBeenCalled();
  });
});
