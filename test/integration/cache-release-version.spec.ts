import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataStatus, MetricType, ReleaseStatus, VisaPurposeCode } from '@prisma/client';
import request from 'supertest';
import { configureApplication } from '../../src/bootstrap.js';
import { PublishReleaseService } from '../../src/modules/ingestion/services/publish-release.service.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

const redisTestUrl = process.env.REDIS_TEST_URL;
const describeCache = redisTestUrl ? describe : describe.skip;

describeCache('cache release version integration', () => {
  let app: INestApplication;
  let publisher: PublishReleaseService;

  beforeAll(async () => {
    process.env.REDIS_ENABLED = 'true';
    process.env.REDIS_URL = redisTestUrl;
    process.env.REDIS_KEY_PREFIX = `visa-atlas:release-integration:${process.pid}:${Date.now()}`;
    process.env.CACHE_ENABLED = 'true';
    process.env.RATE_LIMIT_ENABLED = 'false';
    const { AppModule } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApplication(app);
    await app.init();
    publisher = app.get(PublishReleaseService);
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

  it('changes namespace immediately on publish and rollback', async () => {
    const initial = await request(app.getHttpServer()).get('/api/v1/filters/defaults').expect(200);
    expect(initial.body.year).toBe(2025);

    await prisma.comparisonGroup.create({
      data: {
        id: 'test-comparable-2026',
        datasetId: 'migr-resfirst',
        metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.WORK,
        period: '2026',
        unit: 'PER',
        methodologyVersion: 'synthetic-test-v1',
      },
    });
    await prisma.datasetRelease.create({
      data: {
        id: 'test-release-2026',
        datasetId: 'migr-resfirst',
        fetchedAt: new Date('2026-10-30T00:00:00Z'),
        validatedAt: new Date('2026-10-30T00:00:00Z'),
        checksum: 'synthetic-release-2026',
        status: ReleaseStatus.VERIFIED,
        observations: {
          create: {
            destinationIso3: 'ESP',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.WORK,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EMP',
            period: '2026',
            unit: 'PER',
            value: 84n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-comparable-2026',
          },
        },
      },
    });

    await publisher.publish('test-release-2026');
    const published = await request(app.getHttpServer())
      .get('/api/v1/filters/defaults')
      .expect(200);
    expect(published.body.year).toBe(2026);

    await publisher.rollbackTo('test-release-2025');
    const rolledBack = await request(app.getHttpServer())
      .get('/api/v1/filters/defaults')
      .expect(200);
    expect(rolledBack.body).toEqual(initial.body);
  });
});
