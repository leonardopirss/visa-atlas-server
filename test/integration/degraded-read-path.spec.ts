import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { RedisService } from '../../src/common/redis/redis.service.js';
import { configureApplication } from '../../src/bootstrap.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('degraded read path with Redis unavailable', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_URL = 'redis://127.0.0.1:6399';
    process.env.REDIS_CONNECT_TIMEOUT_MS = '100';
    process.env.REDIS_COMMAND_TIMEOUT_MS = '100';
    process.env.REDIS_CIRCUIT_FAILURE_THRESHOLD = '1';
    process.env.REDIS_RECONNECT_MAX_ATTEMPTS = '1';
    process.env.CACHE_ENABLED = 'true';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.DATABASE_POOL_MAX = '2';
    process.env.DATABASE_REPLICA_COUNT = '1';
    process.env.DATABASE_GLOBAL_CONNECTION_BUDGET = '2';
    process.env.DATABASE_POOL_TIMEOUT_MS = '1000';
    process.env.DATABASE_STATEMENT_TIMEOUT_MS = '5000';
    process.env.DATABASE_QUERY_CONCURRENCY = '2';
    process.env.DATABASE_QUERY_QUEUE_MAX = '4';
    process.env.DATABASE_QUERY_QUEUE_TIMEOUT_MS = '100';

    const { AppModule } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
  });

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    await prisma.$disconnect();
    for (const name of [
      'REDIS_ENABLED',
      'REDIS_URL',
      'REDIS_CONNECT_TIMEOUT_MS',
      'REDIS_COMMAND_TIMEOUT_MS',
      'REDIS_CIRCUIT_FAILURE_THRESHOLD',
      'REDIS_RECONNECT_MAX_ATTEMPTS',
      'CACHE_ENABLED',
      'RATE_LIMIT_ENABLED',
      'DATABASE_POOL_MAX',
      'DATABASE_REPLICA_COUNT',
      'DATABASE_GLOBAL_CONNECTION_BUDGET',
      'DATABASE_POOL_TIMEOUT_MS',
      'DATABASE_STATEMENT_TIMEOUT_MS',
      'DATABASE_QUERY_CONCURRENCY',
      'DATABASE_QUERY_QUEUE_MAX',
      'DATABASE_QUERY_QUEUE_TIMEOUT_MS',
    ]) {
      delete process.env[name];
    }
  });

  it('serves correct bounded reads from PostgreSQL and applies statement timeout', async () => {
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(app.getHttpServer()).get('/api/v1/stats/map').expect(200),
      ),
    );
    expect(responses.every(({ body }) => body.year === 2025)).toBe(true);
    expect(app.get(RedisService).status).toBe('circuit-open');

    const timeout = await app
      .get(PrismaService)
      .$queryRawUnsafe<Array<{ statement_timeout: string }>>('SHOW statement_timeout');
    expect(timeout[0]?.statement_timeout).toBe('5s');
  });
});
