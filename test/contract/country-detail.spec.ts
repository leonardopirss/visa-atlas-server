import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApplication } from '../../src/bootstrap.js';
import { CountryCatalogService } from '../../src/modules/countries/services/country-catalog.service.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('public API contract: country detail and timeseries', () => {
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

  it('aggregates country data while excluding an unverified visa program', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/countries/ESP').expect(200);
    expect(response.body.country.iso3).toBe('ESP');
    expect(response.body.statistics).toMatchObject({ value: 42, dataStatus: 'AVAILABLE' });
    expect(response.body.classifications[0].sourceCategoryCode).toBe('EMP');
    expect(response.body.visaPrograms).toHaveLength(1);
    expect(response.body.visaPrograms[0].id).toBe('verified-program');
    expect(response.body.sources[0]).toMatchObject({
      organization: 'Eurostat',
      datasetCode: 'migr_resfirst',
      releaseId: 'test-release-2025',
    });
    expect(Object.keys(response.body).sort()).toEqual(
      ['classifications', 'country', 'sources', 'statistics', 'visaPrograms'].sort(),
    );
    expect(Object.keys(response.body.visaPrograms[0]).sort()).toEqual(
      [
        'id',
        'officialUrl',
        'purpose',
        'sponsorshipRequirement',
        'summary',
        'title',
        'verifiedAt',
      ].sort(),
    );
  });

  it('returns an ordered timeseries from the same comparable methodology', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/countries/ESP/timeseries?fromYear=2020&toYear=2025')
      .expect(200);
    expect(response.body).toMatchObject({
      iso3: 'ESP',
      citizenship: 'BRA',
      purpose: 'WORK',
      metricType: 'FIRST_RESIDENCE_PERMITS_GRANTED',
      points: [{ year: 2025, statistic: { value: 42, unit: 'PER' } }],
    });
    expect(Object.keys(response.body).sort()).toEqual(
      ['citizenship', 'comparisonGroupId', 'iso3', 'metricType', 'points', 'purpose'].sort(),
    );
  });

  it('rejects an inverted year range', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/countries/ESP/timeseries?fromYear=2026&toYear=2025')
      .expect(422);
    expect(response.body.code).toBe('INCOMPATIBLE_DIMENSIONS');
  });

  it('returns 404 for an unknown ISO3 country', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/countries/ZZZ').expect(404);
    expect(response.body.code).toBe('RESOURCE_NOT_FOUND');
  });

  it.each(['RUS', 'CAN', 'AUS'])(
    'returns 200 and unavailable data for known country %s',
    async (iso3) => {
      await app.get(CountryCatalogService).synchronize();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/countries/${iso3}`)
        .expect(200);

      expect(response.body).toMatchObject({
        country: { iso3 },
        statistics: {
          value: null,
          dataStatus: 'UNAVAILABLE',
          source: null,
        },
        classifications: [],
        visaPrograms: [],
        sources: [],
      });
    },
  );

  it('returns an empty timeseries for a known country without observations', async () => {
    await app.get(CountryCatalogService).synchronize();

    const response = await request(app.getHttpServer())
      .get('/api/v1/countries/CAN/timeseries')
      .expect(200);

    expect(response.body).toMatchObject({
      iso3: 'CAN',
      comparisonGroupId: null,
      points: [],
    });
  });

  it('returns honest absence when the catalog exists but no release is published', async () => {
    await resetDatabase();
    await app.get(CountryCatalogService).synchronize();

    const detail = await request(app.getHttpServer()).get('/api/v1/countries/RUS').expect(200);
    expect(detail.body.statistics).toMatchObject({
      value: null,
      dataStatus: 'UNAVAILABLE',
      period: '',
      source: null,
    });

    const timeseries = await request(app.getHttpServer())
      .get('/api/v1/countries/RUS/timeseries')
      .expect(200);
    expect(timeseries.body.points).toEqual([]);
  });
});
