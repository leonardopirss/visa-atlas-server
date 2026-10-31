import { ConfigService } from '@nestjs/config';
import { databaseUrlWithSafetyLimits } from '../../src/common/database/prisma.service.js';
import { QueryConcurrencyService } from '../../src/common/database/query-concurrency.service.js';
import { validateEnvironment } from '../../src/config/environment.js';
import { assertTestDatabaseUrl } from '../helpers/database.js';

const DATABASE_URL = 'postgresql://user:password@localhost:5432/visa_atlas?schema=public_test';

describe('database test safety', () => {
  it('accepts a dedicated test schema', () => {
    expect(() =>
      assertTestDatabaseUrl(
        'postgresql://user:password@localhost:5432/visa_atlas?schema=public_test',
      ),
    ).not.toThrow();
  });

  it('refuses to reset the development schema', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://user:password@localhost:5432/visa_atlas?schema=public'),
    ).toThrow('Refusing to reset');
  });

  it('configures bounded pool acquisition and statement timeouts in the Prisma URL', () => {
    const result = new URL(databaseUrlWithSafetyLimits(DATABASE_URL, 5, 1_500, 4_000));
    expect(result.searchParams.get('schema')).toBe('public_test');
    expect(result.searchParams.get('connection_limit')).toBe('5');
    expect(result.searchParams.get('pool_timeout')).toBe('2');
    expect(result.searchParams.get('options')).toBe('-c statement_timeout=4000');
  });

  it('enforces the total connection budget across replicas', () => {
    expect(
      validateEnvironment({
        DATABASE_URL,
        DATABASE_POOL_MAX: '5',
        DATABASE_REPLICA_COUNT: '2',
        DATABASE_GLOBAL_CONNECTION_BUDGET: '15',
      }),
    ).toMatchObject({
      DATABASE_POOL_MAX: 5,
      DATABASE_REPLICA_COUNT: 2,
      DATABASE_GLOBAL_CONNECTION_BUDGET: 15,
      DATABASE_POOL_TIMEOUT_MS: 2_000,
      DATABASE_STATEMENT_TIMEOUT_MS: 5_000,
    });
    expect(() =>
      validateEnvironment({
        DATABASE_URL,
        DATABASE_POOL_MAX: '8',
        DATABASE_REPLICA_COUNT: '2',
        DATABASE_GLOBAL_CONNECTION_BUDGET: '15',
      }),
    ).toThrow('exceeds DATABASE_GLOBAL_CONNECTION_BUDGET');
  });

  it('rejects invalid timeout, pool, and queue configuration', () => {
    expect(() => validateEnvironment({ DATABASE_URL, DATABASE_POOL_MAX: '0' })).toThrow(
      'DATABASE_POOL_MAX',
    );
    expect(() =>
      validateEnvironment({ DATABASE_URL, DATABASE_STATEMENT_TIMEOUT_MS: '60001' }),
    ).toThrow('DATABASE_STATEMENT_TIMEOUT_MS');
    expect(() =>
      validateEnvironment({ DATABASE_URL, DATABASE_QUERY_QUEUE_TIMEOUT_MS: '0' }),
    ).toThrow('DATABASE_QUERY_QUEUE_TIMEOUT_MS');
  });

  it('limits active work and rejects a full queue without starting more operations', async () => {
    const service = new QueryConcurrencyService(
      new ConfigService({
        DATABASE_QUERY_CONCURRENCY: 1,
        DATABASE_QUERY_QUEUE_MAX: 0,
        DATABASE_QUERY_QUEUE_TIMEOUT_MS: 20,
      }),
    );
    let release: (() => void) | undefined;
    const first = service.run(() => new Promise<void>((resolve) => (release = resolve)));
    await Promise.resolve();
    await expect(service.run(() => Promise.resolve())).rejects.toMatchObject({
      code: 'DATABASE_CAPACITY_EXCEEDED',
      statusCode: 503,
    });
    expect(service.activeCount).toBe(1);
    release?.();
    await first;
    expect(service.activeCount).toBe(0);
  });
});
