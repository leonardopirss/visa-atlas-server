import { readFile } from 'node:fs/promises';
import { ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { CountryDetailService } from '../../src/modules/countries/services/country-detail.service.js';
import { UkHomeOfficeAdapter } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.adapter.js';
import { UK_HOME_OFFICE_DATASET_ID } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.config.js';
import { UkHomeOfficeReferenceDataService } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office-reference-data.service.js';
import type { UkHomeOfficeRow } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.types.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionLogger } from '../../src/modules/ingestion/observability/ingestion-logger.service.js';
import { PublishReleaseService } from '../../src/modules/ingestion/services/publish-release.service.js';
import { ObservationValidator } from '../../src/modules/ingestion/validation/observation.validator.js';
import { UkHomeOfficeObservationValidator } from '../../src/modules/ingestion/validation/uk-home-office-observation.validator.js';
import { SourcesService } from '../../src/modules/sources/sources.service.js';
import { DefaultFiltersService } from '../../src/modules/statistics/services/default-filters.service.js';
import { TimeseriesService } from '../../src/modules/statistics/services/timeseries.service.js';
import { StatisticsService } from '../../src/modules/statistics/statistics.service.js';
import { VisaProgramsService } from '../../src/modules/visa-programs/visa-programs.service.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

interface Fixture {
  rows: UkHomeOfficeRow[];
}

describe('UK Home Office ingestion integration', () => {
  const database = new PrismaService();
  const adapter = new UkHomeOfficeAdapter();
  const sourceValidator = new UkHomeOfficeObservationValidator();
  const ingestion = new IngestionService(
    database,
    new ObservationValidator(),
    new IngestionLogger(),
  );
  const publisher = new PublishReleaseService(database);
  const referenceData = new UkHomeOfficeReferenceDataService(database);
  const defaults = new DefaultFiltersService(database);
  const statistics = new StatisticsService(database, defaults);
  const timeseries = new TimeseriesService(database);
  const detail = new CountryDetailService(
    database,
    defaults,
    new VisaProgramsService(database),
    new SourcesService(database),
  );
  let observations: ReturnType<UkHomeOfficeAdapter['parse']>;
  let rawPayload: string;

  beforeAll(async () => {
    await database.$connect();
    rawPayload = await readFile('test/fixtures/uk-home-office/occ-d02.synthetic.json', 'utf8');
    observations = adapter.parse((JSON.parse(rawPayload) as Fixture).rows);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
    await prisma.country.create({
      data: { iso3: 'GBR', iso2: 'GB', namePt: 'Reino Unido', region: 'Europa' },
    });
    await referenceData.synchronize();
  });

  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('valida, publica atomicamente e preserva as categorias originais', async () => {
    sourceValidator.validate(observations);
    const staged = await ingestion.stage({
      datasetId: UK_HOME_OFFICE_DATASET_ID,
      rawPayload,
      fetchedAt: new Date('2026-10-24T00:00:00Z'),
      sourcePublishedAt: new Date('2026-08-27T00:00:00Z'),
      observations,
    });
    expect(staged).toMatchObject({ duplicate: false, status: ReleaseStatus.VERIFIED });
    await publisher.publish(staged.releaseId);
    expect(
      await prisma.metricObservation.findMany({
        where: { releaseId: staged.releaseId },
        orderBy: { sourceCategoryCode: 'asc' },
      }),
    ).toEqual([
      expect.objectContaining({
        sourceCategoryCode: 'Temporary Worker:Creative Worker',
        value: 14n,
      }),
      expect.objectContaining({ sourceCategoryCode: 'Worker:Skilled Worker', value: 42n }),
    ]);
    const query = {
      citizenship: 'BRA',
      purpose: 'WORK' as const,
      metricType: 'WORK_VISAS_ISSUED' as const,
      year: 2025,
    };
    const map = await statistics.getMap(query);
    expect(map.countries.find(({ iso3 }) => iso3 === 'GBR')?.statistic).toMatchObject({
      value: 56,
      unit: 'VISAS',
      metricType: 'WORK_VISAS_ISSUED',
    });
    await expect(detail.get('GBR', query)).resolves.toMatchObject({
      statistics: { value: 56 },
      classifications: [{}, {}],
      sources: [{ organization: 'UK Home Office', datasetCode: 'Occ_D02' }],
    });
    await expect(
      timeseries.get('GBR', {
        citizenship: 'BRA',
        purpose: 'WORK',
        metricType: 'WORK_VISAS_ISSUED',
        fromYear: 2025,
        toYear: 2025,
      }),
    ).resolves.toMatchObject({
      points: [{ year: 2025, statistic: { value: 56, unit: 'VISAS' } }],
    });
  });

  it('é idempotente por checksum', async () => {
    const input = {
      datasetId: UK_HOME_OFFICE_DATASET_ID,
      rawPayload,
      fetchedAt: new Date('2026-10-24T00:00:00Z'),
      sourcePublishedAt: null,
      observations,
    };
    const first = await ingestion.stage(input);
    const second = await ingestion.stage(input);
    expect(second).toEqual({ ...first, duplicate: true });
  });

  it('rejeita dimensões alteradas sem substituir o snapshot publicado', async () => {
    const valid = await ingestion.stage({
      datasetId: UK_HOME_OFFICE_DATASET_ID,
      rawPayload,
      fetchedAt: new Date('2026-10-24T00:00:00Z'),
      sourcePublishedAt: null,
      observations,
    });
    await publisher.publish(valid.releaseId);
    await expect(
      ingestion.stage({
        datasetId: UK_HOME_OFFICE_DATASET_ID,
        rawPayload: `${rawPayload}-invalid`,
        fetchedAt: new Date('2026-10-24T01:00:00Z'),
        sourcePublishedAt: null,
        observations: observations.map((observation) => ({
          ...observation,
          unit: 'PEOPLE',
        })),
      }),
    ).rejects.toThrow('UK_HOME_OFFICE_DIMENSIONS_INVALID');
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: valid.releaseId } }),
    ).toMatchObject({ status: ReleaseStatus.PUBLISHED });
  });
});
