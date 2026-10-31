import { canonicalizeCacheQuery, createCacheKey } from '../../src/common/cache/cache-key.js';

describe('cache key', () => {
  it('canonicalizes object keys and ignores undefined without changing meaningful values', () => {
    expect(canonicalizeCacheQuery({ page: 1, search: ' espanha ', omitted: undefined })).toBe(
      '{"page":1,"search":" espanha "}',
    );
    expect(canonicalizeCacheQuery({ search: 'espanha', page: 1 })).toBe(
      canonicalizeCacheQuery({ page: 1, search: 'espanha' }),
    );
    expect(canonicalizeCacheQuery({ id: ' group ' })).not.toBe(
      canonicalizeCacheQuery({ id: 'group' }),
    );
  });

  it('produces stable bounded hashes while isolating version and environment', () => {
    const base = {
      environment: 'test',
      contractVersion: 'v1',
      route: 'stats-map',
      releaseVersion: 'release-a',
      query: { citizenship: 'BRA', purpose: 'WORK' },
    };
    const first = createCacheKey(base);
    expect(first).toMatch(/^cache:test:v1:stats-map:[a-f0-9]{16}:[a-f0-9]{32}$/);
    expect(createCacheKey({ ...base, query: { purpose: 'WORK', citizenship: 'BRA' } })).toBe(first);
    expect(createCacheKey({ ...base, releaseVersion: 'release-b' })).not.toBe(first);
    expect(createCacheKey({ ...base, environment: 'production' })).not.toBe(first);
  });
});
