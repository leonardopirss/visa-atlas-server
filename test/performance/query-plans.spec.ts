import { DataStatus, MetricType, Prisma, ReleaseStatus, VisaPurposeCode } from '@prisma/client';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { CountryCatalogService } from '../../src/modules/countries/services/country-catalog.service.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

describe('critical query plans', () => {
  const database = new PrismaService();
  const catalog = new CountryCatalogService(database);

  beforeAll(async () => database.$connect());
  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
    await catalog.synchronize();
    await database.sourceOrganization.create({
      data: {
        id: 'uk-home-office',
        name: 'UK Home Office',
        homepageUrl: 'https://www.gov.uk/government/organisations/home-office',
      },
    });
    await database.sourceDataset.create({
      data: {
        id: 'uk-home-office-occ-d02',
        organizationId: 'uk-home-office',
        code: 'Occ_D02',
        url: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables',
        schemaVersion: 'test',
      },
    });
    await database.comparisonGroup.create({
      data: {
        id: 'uk-test-2025',
        datasetId: 'uk-home-office-occ-d02',
        metricType: MetricType.WORK_VISAS_ISSUED,
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.WORK,
        period: '2025',
        unit: 'VISAS',
        methodologyVersion: 'test',
      },
    });
    await database.datasetRelease.create({
      data: {
        id: 'uk-test-release',
        datasetId: 'uk-home-office-occ-d02',
        fetchedAt: new Date('2026-10-24T00:00:00Z'),
        checksum: 'uk-performance-test',
        status: ReleaseStatus.PUBLISHED,
        observations: {
          create: {
            destinationIso3: 'GBR',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.WORK,
            metricType: MetricType.WORK_VISAS_ISSUED,
            sourceCategoryCode: 'Worker:Skilled Worker',
            period: '2025',
            unit: 'VISAS',
            value: 1n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'uk-test-2025',
          },
        },
      },
    });
    await database.$executeRaw(Prisma.sql`ANALYZE metric_observations`);
  });
  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('has the composite index required by the map query', async () => {
    const indexes = await database.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'metric_observations'
    `;
    expect(indexes.map(({ indexname }) => indexname)).toContain(
      'metric_observations_comparison_group_id_destination_iso3_idx',
    );
  });

  it('can explain the country-period lookup without changing data', async () => {
    const plan = await database.$queryRaw<Array<{ 'QUERY PLAN': string }>>(Prisma.sql`
      EXPLAIN SELECT * FROM metric_observations
      WHERE destination_iso3 = ${'ESP'} AND period = ${'2025'}
    `);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('uses the coverage index for published lookups with multiple datasets', async () => {
    expect(await database.country.count()).toBe(249);
    expect(await database.sourceDataset.count()).toBe(2);
    const plan = await database.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL enable_seqscan = off`;
      return transaction.$queryRaw<Array<{ 'QUERY PLAN': string }>>(Prisma.sql`
        EXPLAIN SELECT observation.*
        FROM metric_observations observation
        JOIN dataset_releases release ON release.id = observation.release_id
        WHERE observation.comparison_group_id = ${'uk-test-2025'}
          AND release.status = ${'PUBLISHED'}::"ReleaseStatus"
      `);
    });
    expect(plan.map((line) => line['QUERY PLAN']).join('\n')).toContain(
      'metric_observations_comparison_group_id_destination_iso3_idx',
    );
  });
});
