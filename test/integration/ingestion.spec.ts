import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DataStatus, ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { EurostatAdapter } from '../../src/modules/ingestion/adapters/eurostat/eurostat.adapter.js';
import { EUROSTAT_BRAZIL_WORK_CONFIG } from '../../src/modules/ingestion/adapters/eurostat/eurostat.config.js';
import type {
  EurostatAdapterConfig,
  EurostatPayload,
} from '../../src/modules/ingestion/adapters/eurostat/eurostat.types.js';
import { IngestionService } from '../../src/modules/ingestion/ingestion.service.js';
import { IngestionLogger } from '../../src/modules/ingestion/observability/ingestion-logger.service.js';
import { PublishReleaseService } from '../../src/modules/ingestion/services/publish-release.service.js';
import { IngestionValidationError } from '../../src/modules/ingestion/validation/ingestion-validation.error.js';
import { ObservationValidator } from '../../src/modules/ingestion/validation/observation.validator.js';
import { prisma, resetDatabase, seedPublishedFixture } from '../helpers/database.js';

const adapterConfig: EurostatAdapterConfig = {
  ...EUROSTAT_BRAZIL_WORK_CONFIG,
  destinationIso2ToIso3: { ES: 'ESP', DE: 'DEU', FR: 'FRA' },
};

describe('Eurostat ingestion integration', () => {
  const database = new PrismaService();
  const adapter = new EurostatAdapter();
  const ingestion = new IngestionService(
    database,
    new ObservationValidator(),
    new IngestionLogger(),
  );
  const publisher = new PublishReleaseService(database);
  let payload: EurostatPayload;
  let rawPayload: string;

  beforeAll(async () => {
    await database.$connect();
    rawPayload = await readFile('test/fixtures/eurostat-release.synthetic.json', 'utf8');
    payload = JSON.parse(rawPayload) as EurostatPayload;
  });

  beforeEach(async () => {
    await resetDatabase();
    await seedPublishedFixture();
  });

  afterAll(async () => {
    await resetDatabase();
    await database.$disconnect();
    await prisma.$disconnect();
  });

  it('stages, validates and publishes atomically while preserving zero and suppression', async () => {
    const observations = adapter.parse(payload, adapterConfig);
    expect(observations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destinationIso3: 'DEU',
          value: 0n,
          dataStatus: DataStatus.AVAILABLE,
        }),
        expect.objectContaining({
          destinationIso3: 'FRA',
          value: null,
          dataStatus: DataStatus.SUPPRESSED,
        }),
      ]),
    );
    const staged = await ingestion.stage({
      datasetId: 'migr-resfirst',
      rawPayload,
      fetchedAt: new Date('2026-10-20T00:00:00Z'),
      sourcePublishedAt: new Date('2026-10-19T00:00:00Z'),
      observations,
    });
    expect(staged).toMatchObject({ duplicate: false, status: ReleaseStatus.VERIFIED });
    await publisher.publish(staged.releaseId);
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: staged.releaseId } }),
    ).toMatchObject({
      status: ReleaseStatus.PUBLISHED,
    });
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: 'test-release-2025' } }),
    ).toMatchObject({
      status: ReleaseStatus.VERIFIED,
    });
  });

  it('is idempotent for the same dataset checksum and creates no duplicate observations', async () => {
    const observations = adapter.parse(payload, adapterConfig);
    const input = {
      datasetId: 'migr-resfirst',
      rawPayload,
      fetchedAt: new Date('2026-10-20T00:00:00Z'),
      sourcePublishedAt: null,
      observations,
    };
    const first = await ingestion.stage(input);
    const countBefore = await prisma.metricObservation.count();
    const second = await ingestion.stage(input);
    expect(second).toEqual({ ...first, duplicate: true });
    expect(await prisma.metricObservation.count()).toBe(countBefore);
  });

  it('keeps the published snapshot when source parsing fails', async () => {
    const invalid = { ...payload, id: payload.id.filter((id) => id !== 'reason') };
    expect(() => adapter.parse(invalid, adapterConfig)).toThrow(IngestionValidationError);
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: 'test-release-2025' } }),
    ).toMatchObject({
      status: ReleaseStatus.PUBLISHED,
    });
  });

  it('rejects an incompatible unit and does not replace the published release', async () => {
    const observations = adapter
      .parse(payload, adapterConfig)
      .map((observation) => ({ ...observation, unit: 'PC' }));
    await expect(
      ingestion.stage({
        datasetId: 'migr-resfirst',
        rawPayload: `${rawPayload}-invalid-unit`,
        fetchedAt: new Date('2026-10-20T00:00:00Z'),
        sourcePublishedAt: null,
        observations,
      }),
    ).rejects.toThrow('UNIT_INVALID');
    expect(
      await prisma.datasetRelease.findFirst({
        where: { checksum: { not: 'synthetic-contract-fixture' } },
      }),
    ).toMatchObject({
      status: ReleaseStatus.REJECTED,
    });
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: 'test-release-2025' } }),
    ).toMatchObject({
      status: ReleaseStatus.PUBLISHED,
    });
  });

  it('rejects an empty original category code', async () => {
    const observations = adapter
      .parse(payload, adapterConfig)
      .map((observation) => ({ ...observation, sourceCategoryCode: '' }));
    await expect(
      ingestion.stage({
        datasetId: 'migr-resfirst',
        rawPayload: `${rawPayload}-invalid-category`,
        fetchedAt: new Date('2026-10-20T00:00:00Z'),
        sourcePublishedAt: null,
        observations,
      }),
    ).rejects.toThrow('SOURCE_CATEGORY_MISSING');
  });

  it('records an operational failure without permanently rejecting the source checksum', async () => {
    const observations = adapter
      .parse(payload, adapterConfig)
      .map((observation, index) =>
        index === 0 ? { ...observation, destinationIso3: 'ZZZ' } : observation,
      );
    const failedRawPayload = `${rawPayload}-operational-failure`;

    await expect(
      ingestion.stage({
        datasetId: 'migr-resfirst',
        rawPayload: failedRawPayload,
        fetchedAt: new Date('2026-10-20T00:00:00Z'),
        sourcePublishedAt: null,
        observations,
      }),
    ).rejects.toMatchObject({ code: 'P2003' });

    expect(
      await prisma.datasetRelease.findUnique({
        where: {
          datasetId_checksum: {
            datasetId: 'migr-resfirst',
            checksum: createHash('sha256').update(failedRawPayload).digest('hex'),
          },
        },
      }),
    ).toBeNull();
    expect(await prisma.ingestionJob.findFirst({ orderBy: { startedAt: 'desc' } })).toMatchObject({
      status: 'FAILED',
    });
  });

  it('supports a logical rollback to a previously verified release', async () => {
    const observations = adapter.parse(payload, adapterConfig);
    const staged = await ingestion.stage({
      datasetId: 'migr-resfirst',
      rawPayload,
      fetchedAt: new Date('2026-10-20T00:00:00Z'),
      sourcePublishedAt: null,
      observations,
    });
    await publisher.publish(staged.releaseId);
    await publisher.rollbackTo('test-release-2025');
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: 'test-release-2025' } }),
    ).toMatchObject({ status: ReleaseStatus.PUBLISHED });
    expect(
      await prisma.datasetRelease.findUnique({ where: { id: staged.releaseId } }),
    ).toMatchObject({
      status: ReleaseStatus.VERIFIED,
    });
  });
});
