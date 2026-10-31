import { ConfigService } from '@nestjs/config';
import { jest } from '@jest/globals';
import { CacheStampedeService } from '../../src/common/cache/cache-stampede.service.js';
import type { RedisService } from '../../src/common/redis/redis.service.js';

function createService(results: Array<{ status: 'ok'; value: unknown }>) {
  const evalMock = jest.fn<RedisService['eval']>();
  for (const result of results) evalMock.mockResolvedValueOnce(result);
  evalMock.mockResolvedValue({ status: 'ok', value: 0 });
  return {
    service: new CacheStampedeService(
      { eval: evalMock } as unknown as RedisService,
      new ConfigService({ CACHE_LOCK_TTL_MS: 50, CACHE_LOCK_WAIT_MS: 10 }),
    ),
    evalMock,
  };
}

describe('CacheStampedeService', () => {
  it('coalesces concurrent work in one process', async () => {
    const { service } = createService([
      { status: 'ok', value: 1 },
      { status: 'ok', value: 1 },
    ]);
    let resolveLoad: ((value: string) => void) | undefined;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const options = { key: 'same', load, readCached: () => Promise.resolve(undefined) };
    const first = service.run(options);
    const second = service.run(options);
    await Promise.resolve();
    await Promise.resolve();
    resolveLoad?.('loaded');
    await expect(Promise.all([first, second])).resolves.toEqual(['loaded', 'loaded']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('waits briefly for another owner to populate the cache', async () => {
    const { service } = createService([{ status: 'ok', value: 0 }]);
    const readCached = jest
      .fn<() => Promise<string | undefined>>()
      .mockResolvedValueOnce('from-owner');
    const load = jest.fn<() => Promise<string>>().mockResolvedValue('loaded');
    await expect(service.run({ key: 'locked', load, readCached })).resolves.toBe('from-owner');
    expect(load).not.toHaveBeenCalled();
  });

  it('recovers after an orphaned lock without waiting indefinitely', async () => {
    const { service } = createService([{ status: 'ok', value: 0 }]);
    const load = jest.fn<() => Promise<string>>().mockResolvedValue('fallback');
    await expect(
      service.run({ key: 'orphan', load, readCached: () => Promise.resolve(undefined) }),
    ).resolves.toBe('fallback');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('releases only through the owner-token compare-and-delete script', async () => {
    const { service, evalMock } = createService([
      { status: 'ok', value: 1 },
      { status: 'ok', value: 1 },
    ]);
    await service.run({
      key: 'owner',
      load: () => Promise.resolve('value'),
      readCached: () => Promise.resolve(undefined),
    });
    expect(evalMock).toHaveBeenCalledTimes(2);
    expect(evalMock.mock.calls[1]?.[1]).toEqual(['lock:owner']);
    expect(evalMock.mock.calls[1]?.[2]?.[0]).toBe(evalMock.mock.calls[0]?.[2]?.[0]);
  });
});
