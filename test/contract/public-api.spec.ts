import { readFile } from 'node:fs/promises';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { parse } from 'yaml';
import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('public API contract: defaults, countries and map', () => {
  let app: INestApplication;

  beforeAll(async () => {
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
  });

  it('loads the shared OpenAPI document and keeps exactly five operations', async () => {
    const source = await readFile('contracts/openapi.yaml', 'utf8');
    const document = parse(source) as { paths?: Record<string, unknown> };
    expect(Object.keys(document.paths ?? {})).toEqual([
      '/filters/defaults',
      '/countries',
      '/stats/map',
      '/countries/{iso3}',
      '/countries/{iso3}/timeseries',
    ]);
  });

  it('returns defaults only from a published comparable release', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/filters/defaults').expect(200);
    expect(response.body).toEqual({
      citizenship: 'BRA',
      purpose: 'WORK',
      year: 2025,
      metricType: 'FIRST_RESIDENCE_PERMITS_GRANTED',
      comparisonGroupId: 'test-comparable-2025',
      unit: 'PER',
      dataAvailable: true,
    });
  });

  it('paginates and searches the country catalog', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/countries?search=espanha&page=1&pageSize=10')
      .expect(200);
    expect(response.body).toMatchObject({
      data: [{ iso3: 'ESP', iso2: 'ES', name: 'Espanha', region: 'Europa' }],
      page: 1,
      pageSize: 10,
      total: 1,
    });
    expect(Object.keys(response.body.data[0]).sort()).toEqual(['iso2', 'iso3', 'name', 'region']);
  });

  it('returns availability and statistics in one map payload', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/stats/map').expect(200);
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
    expect(response.headers['ratelimit-limit']).toBe('120');
    expect(response.body.year).toBe(2025);
    expect(response.body.countries).toHaveLength(3);
    expect(response.body.legendLabel).toContain('não representa vistos consulares');
    expect(Object.keys(response.body).sort()).toEqual(
      ['citizenship', 'countries', 'legendLabel', 'purpose', 'year'].sort(),
    );
    expect(Object.keys(response.body.countries[0].statistic).sort()).toEqual(
      [
        'comparisonGroupId',
        'dataStatus',
        'freshness',
        'metricType',
        'period',
        'source',
        'unit',
        'value',
      ].sort(),
    );
  });

  it('returns a typed validation error and correlation id', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=invalid')
      .set('x-correlation-id', 'contract-test')
      .expect(400);
    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      correlationId: 'contract-test',
    });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('replaces an unsafe correlation id before reflecting it in headers or errors', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/stats/map?citizenship=invalid')
      .set('x-correlation-id', 'contains spaces')
      .expect(400);
    expect(response.headers['x-correlation-id']).toMatch(/^[a-f0-9-]{36}$/);
    expect(response.body.correlationId).toBe(response.headers['x-correlation-id']);
  });
});
