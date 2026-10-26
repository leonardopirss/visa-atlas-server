import { readFile } from 'node:fs/promises';
import { ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { CountryDetailService } from '../../src/modules/countries/services/country-detail.service.js';
import { IrccCanadaAdapter } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.adapter.js';
import { IRCC_CANADA_DATASET_ID } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.config.js';
import { IrccCanadaReferenceDataService } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada-reference-data.service.js';
import type { IrccCanadaRow } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.types.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionLogger } from '../../src/modules/ingestion/observability/ingestion-logger.service.js';
import { PublishReleaseService } from '../../src/modules/ingestion/services/publish-release.service.js';
import { IrccCanadaObservationValidator } from '../../src/modules/ingestion/validation/ircc-canada-observation.validator.js';
import { ObservationValidator } from '../../src/modules/ingestion/validation/observation.validator.js';
import { SourcesService } from '../../src/modules/sources/sources.service.js';
import { DefaultFiltersService } from '../../src/modules/statistics/services/default-filters.service.js';
import { TimeseriesService } from '../../src/modules/statistics/services/timeseries.service.js';
import { StatisticsService } from '../../src/modules/statistics/statistics.service.js';
import { VisaProgramsService } from '../../src/modules/visa-programs/visa-programs.service.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

interface Fixture {
  rows: IrccCanadaRow[];
}

describe('IRCC Canada ingestion integration', () => {
  const database = new PrismaService();
  const adapter = new IrccCanadaAdapter();
  const sourceValidator = new IrccCanadaObservationValidator();
  const ingestion = new IngestionService(
    database,
    new ObservationValidator(),
    new IngestionLogger(),
  );
  const publisher = new PublishReleaseService(database);
  const referenceData = new IrccCanadaReferenceDataService(database);
  const defaults = new DefaultFiltersService(database);
  const statistics = new StatisticsService(database, defaults);
  const timeseries = new TimeseriesService(database);
  const detail = new CountryDetailService(
    database,
    defaults,
    new VisaProgramsService(database),
    new SourcesService(database),
  );
  let observations: ReturnType<IrccCanadaAdapter['parse']>;
  let rawPayload: string;

  beforeAll(async () => {
    await database.$connect();
    rawPayload = await readFile('test/fixtures/ircc-canada/imp-year-end.synthetic.json', 'utf8');
    observations = adapter.parse((JSON.parse(rawPayload) as Fixture).rows);
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
    await referenceData.synchronize();
  });

  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('publishes the annual IMP stock and exposes it without mixing comparison groups', async () => {
    sourceValidator.validate(observations);
    const staged = await ingestion.stage({
      datasetId: IRCC_CANADA_DATASET_ID,
      rawPayload,
      fetchedAt: new Date('2026-10-25T00:00:00Z'),
      sourcePublishedAt: new Date('2025-03-17T00:00:00Z'),
      observations,
    });
    expect(staged).toMatchObject({ duplicate: false, status: ReleaseStatus.VERIFIED });
    await publisher.publish(staged.releaseId);

    const query = {
      citizenship: 'BRA',
      purpose: 'WORK' as const,
      metricType: 'VALID_PERMIT_HOLDERS' as const,
      year: 2024,
    };
    const map = await statistics.getMap(query);
    expect(map.legendLabel).toContain('IMP');
    expect(map.countries.find(({ iso3 }) => iso3 === 'CAN')?.statistic).toMatchObject({
      value: 15_655,
      unit: 'HOLDERS',
      period: '2024',
      metricType: 'VALID_PERMIT_HOLDERS',
    });
    await expect(detail.get('CAN', query)).resolves.toMatchObject({
      statistics: { value: 15_655 },
      sources: [
        {
          organization: 'Immigration, Refugees and Citizenship Canada (IRCC)',
          datasetCode: 'IMP_CITZ_YEAR_END_WORK',
        },
      ],
    });
    await expect(
      timeseries.get('CAN', {
        citizenship: 'BRA',
        purpose: 'WORK',
        metricType: 'VALID_PERMIT_HOLDERS',
        fromYear: 2022,
        toYear: 2024,
      }),
    ).resolves.toMatchObject({
      points: [
        { year: 2022, statistic: { value: 13_795 } },
        { year: 2023, statistic: { value: 16_485 } },
        { year: 2024, statistic: { value: 15_655 } },
      ],
    });
  });

  it('is idempotent by official workbook checksum', async () => {
    const input = {
      datasetId: IRCC_CANADA_DATASET_ID,
      rawPayload,
      fetchedAt: new Date('2026-10-25T00:00:00Z'),
      sourcePublishedAt: null,
      observations,
    };
    const first = await ingestion.stage(input);
    const second = await ingestion.stage(input);
    expect(second).toEqual({ ...first, duplicate: true });
  });

  it('rejects changed dimensions without replacing the published snapshot', async () => {
    const valid = await ingestion.stage({
      datasetId: IRCC_CANADA_DATASET_ID,
      rawPayload,
      fetchedAt: new Date('2026-10-25T00:00:00Z'),
      sourcePublishedAt: null,
      observations,
    });
    await publisher.publish(valid.releaseId);
    await expect(
      ingestion.stage({
        datasetId: IRCC_CANADA_DATASET_ID,
        rawPayload: `${rawPayload}-invalid`,
        fetchedAt: new Date('2026-10-25T01:00:00Z'),
        sourcePublishedAt: null,
        observations: observations.map((observation) => ({
          ...observation,
          unit: 'PEOPLE',
        })),
      }),
    ).rejects.toThrow('IRCC_CANADA_DIMENSIONS_INVALID');
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: valid.releaseId } }),
    ).toMatchObject({ status: ReleaseStatus.PUBLISHED });
  });
});
