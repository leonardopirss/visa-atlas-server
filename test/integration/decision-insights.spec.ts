import {
  DataStatus,
  MetricType,
  PopulationBasis,
  ReleaseStatus,
  VisaPurposeCode,
} from '@prisma/client';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import type { StagedObservation } from '../../src/modules/ingestion/adapters/eurostat/eurostat.types.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionLogger } from '../../src/modules/ingestion/observability/ingestion-logger.service.js';
import { PublishReleaseService } from '../../src/modules/ingestion/services/publish-release.service.js';
import { ObservationValidator } from '../../src/modules/ingestion/validation/observation.validator.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

const DATASET_ID = 'uk-vis-d02-test';

function observation(
  metricType: MetricType,
  value: bigint,
  overrides: Partial<StagedObservation> = {},
): StagedObservation {
  return {
    destinationIso3: 'GBR',
    citizenshipIso3: 'BRA',
    populationBasis: PopulationBasis.CITIZENSHIP,
    populationKey: 'BRA',
    programKey: 'uk-entry-clearance:skilled-worker',
    purpose: VisaPurposeCode.WORK,
    metricType,
    sourceCategoryCode: 'Worker:Skilled Worker',
    sourceCategoryLabel: 'Worker — Skilled Worker',
    period: '2025',
    unit: 'COUNT',
    value,
    dataStatus: DataStatus.AVAILABLE,
    methodologyVersion: 'vis-d02-test-v1',
    ...overrides,
  };
}

describe('visa decision insights ingestion integration', () => {
  const database = new PrismaService();
  const ingestion = new IngestionService(
    database,
    new ObservationValidator(),
    new IngestionLogger(),
  );
  const publisher = new PublishReleaseService(database);

  beforeAll(async () => database.$connect());

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
    await prisma.country.create({
      data: { iso3: 'GBR', iso2: 'GB', namePt: 'Reino Unido', region: 'Europa' },
    });
    await prisma.sourceOrganization.create({
      data: {
        id: 'uk-home-office-decisions-test',
        name: 'UK Home Office (synthetic test)',
        homepageUrl: 'https://www.gov.uk/government/organisations/home-office',
        license: 'Synthetic fixture; not production data',
      },
    });
    await prisma.sourceDataset.create({
      data: {
        id: DATASET_ID,
        organizationId: 'uk-home-office-decisions-test',
        code: 'Vis_D02 synthetic',
        url: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables',
        methodologyUrl:
          'https://www.gov.uk/government/publications/immigration-system-statistics-user-guide',
        schemaVersion: 'synthetic-test-v1',
      },
    });
  });

  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('stages counts and derived rates atomically with reconstructible lineage', async () => {
    const staged = await ingestion.stage({
      datasetId: DATASET_ID,
      rawPayload: 'synthetic-vis-d02-compatible',
      fetchedAt: new Date('2026-11-17T00:00:00Z'),
      sourcePublishedAt: new Date('2026-11-10T00:00:00Z'),
      observations: [
        observation(MetricType.DECISIONS_GRANTED, 3n),
        observation(MetricType.DECISIONS_REFUSED, 1n),
      ],
    });

    expect(staged).toMatchObject({ duplicate: false, status: ReleaseStatus.VERIFIED });
    const observations = await prisma.metricObservation.findMany({
      where: { releaseId: staged.releaseId },
      include: {
        derivationResult: {
          include: { operands: { include: { observation: true } } },
        },
      },
      orderBy: { metricType: 'asc' },
    });
    expect(observations).toHaveLength(4);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metricType: MetricType.APPROVAL_RATE, value: 7500n }),
        expect.objectContaining({ metricType: MetricType.REFUSAL_RATE, value: 2500n }),
      ]),
    );
    for (const rate of observations.filter(({ unit }) => unit === 'BASIS_POINTS')) {
      expect(rate.derivationResult).toMatchObject({ precision: 2 });
      expect(rate.derivationResult?.operands).toHaveLength(3);
      expect(
        rate.derivationResult?.operands.map(({ observation }) => observation.metricType),
      ).toEqual(
        expect.arrayContaining([
          MetricType.DECISIONS_GRANTED,
          MetricType.DECISIONS_GRANTED,
          MetricType.DECISIONS_REFUSED,
        ]),
      );
    }

    await publisher.publish(staged.releaseId);
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: staged.releaseId } }),
    ).toMatchObject({ status: ReleaseStatus.PUBLISHED });
  });

  it('is idempotent by source checksum without duplicating derivations', async () => {
    const input = {
      datasetId: DATASET_ID,
      rawPayload: 'synthetic-vis-d02-idempotent',
      fetchedAt: new Date('2026-11-17T00:00:00Z'),
      sourcePublishedAt: null,
      observations: [
        observation(MetricType.DECISIONS_GRANTED, 2n),
        observation(MetricType.DECISIONS_REFUSED, 2n),
      ],
    };
    const first = await ingestion.stage(input);
    const second = await ingestion.stage(input);

    expect(second).toEqual({ ...first, duplicate: true });
    expect(
      await prisma.metricDerivation.count({
        where: { observation: { releaseId: first.releaseId } },
      }),
    ).toBe(2);
  });

  it.each([
    {
      name: 'zero denominator',
      observations: [
        observation(MetricType.DECISIONS_GRANTED, 0n),
        observation(MetricType.DECISIONS_REFUSED, 0n),
      ],
      error: 'DERIVATION_DENOMINATOR_NOT_POSITIVE',
    },
    {
      name: 'incompatible program scope',
      observations: [
        observation(MetricType.DECISIONS_GRANTED, 3n),
        observation(MetricType.DECISIONS_REFUSED, 1n, {
          programKey: 'uk-entry-clearance:student',
        }),
      ],
      error: 'DERIVATION_OPERANDS_INCOMPATIBLE',
    },
  ])('rejects $name and preserves the published snapshot', async ({ observations, error }) => {
    const baseline = await ingestion.stage({
      datasetId: DATASET_ID,
      rawPayload: 'synthetic-vis-d02-baseline',
      fetchedAt: new Date('2026-11-16T00:00:00Z'),
      sourcePublishedAt: new Date('2026-11-10T00:00:00Z'),
      observations: [
        observation(MetricType.DECISIONS_GRANTED, 3n),
        observation(MetricType.DECISIONS_REFUSED, 1n),
      ],
    });
    await publisher.publish(baseline.releaseId);

    await expect(
      ingestion.stage({
        datasetId: DATASET_ID,
        rawPayload: `synthetic-vis-d02-invalid-${error}`,
        fetchedAt: new Date('2026-11-17T00:00:00Z'),
        sourcePublishedAt: new Date('2026-11-11T00:00:00Z'),
        observations,
      }),
    ).rejects.toThrow(error);
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: baseline.releaseId } }),
    ).toMatchObject({ status: ReleaseStatus.PUBLISHED });
    expect(
      await prisma.datasetRelease.findFirst({
        where: { datasetId: DATASET_ID, status: ReleaseStatus.REJECTED },
        orderBy: { fetchedAt: 'desc' },
      }),
    ).not.toBeNull();
  });
});
