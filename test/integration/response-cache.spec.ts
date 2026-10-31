import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { RedisCacheService } from '../../src/common/cache/redis-cache.service.js';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { RedisService } from '../../src/common/redis/redis.service.js';
import { configureApplication } from '../../src/bootstrap.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

const redisTestUrl = process.env.REDIS_TEST_URL;
const describeCache = redisTestUrl ? describe : describe.skip;

describeCache('response cache integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_URL = redisTestUrl;
    process.env.REDIS_KEY_PREFIX = `visa-atlas:cache-integration:${process.pid}:${Date.now()}`;
    process.env.CACHE_ENABLED = 'true';
    process.env.RATE_LIMIT_ENABLED = 'false';
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
    delete process.env.CACHE_ENABLED;
    delete process.env.REDIS_ENABLED;
    delete process.env.REDIS_URL;
    delete process.env.REDIS_KEY_PREFIX;
  });

  it('serves a canonical warm hit without executing domain queries', async () => {
    const first = await request(app.getHttpServer())
      .get('/api/v1/stats/map?purpose=WORK&citizenship=BRA')
      .expect(200);
    const database = app.get(PrismaService);
    const countryQuery = jest.spyOn(database.country, 'findMany');
    const groupQuery = jest.spyOn(database.comparisonGroup, 'findFirst');
    const observationQuery = jest.spyOn(database.metricObservation, 'findMany');

    const second = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=BRA&purpose=WORK')
      .expect(200);

    expect(second.text).toBe(first.text);
    expect(second.headers['cache-control']).toBe(first.headers['cache-control']);
    expect(countryQuery).not.toHaveBeenCalled();
    expect(groupQuery).not.toHaveBeenCalled();
    expect(observationQuery).not.toHaveBeenCalled();
  });

  it('expires TTL-backed entries', async () => {
    const cache = app.get(RedisCacheService);
    await expect(
      cache.set('short-lived', { ok: true }, { ttlSeconds: 0.05, maxBytes: 128 }),
    ).resolves.toBe('stored');
    await expect(cache.get('short-lived')).resolves.toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 80));
    await expect(cache.get('short-lived')).resolves.toBeUndefined();
  });

  it('falls back to PostgreSQL with the same HTTP contract when Redis fails', async () => {
    await app.get(RedisService).onModuleDestroy();
    const response = await request(app.getHttpServer()).get('/api/v1/countries').expect(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 30, total: 3 });
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
  });
});
