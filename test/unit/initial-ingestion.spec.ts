import { jest } from '@jest/globals';
import { ReleaseStatus } from '@prisma/client';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { EUROSTAT_DATASET_ID } from '../../src/modules/ingestion/adapters/eurostat/eurostat.config.js';
import { IRCC_CANADA_DATASET_ID } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.config.js';
import { UK_HOME_OFFICE_DATASET_ID } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.config.js';
import type { EurostatIngestionRunner } from '../../src/modules/ingestion/eurostat-ingestion-runner.service.js';
import { InitialIngestionService } from '../../src/modules/ingestion/initial-ingestion.service.js';
import type { IrccCanadaIngestionRunner } from '../../src/modules/ingestion/ircc-canada-ingestion-runner.service.js';
import type { UkHomeOfficeIngestionRunner } from '../../src/modules/ingestion/uk-home-office-ingestion-runner.service.js';

describe('initial ingestion', () => {
  const createSubject = (publishedDatasetIds: readonly string[]) => {
    const findMany = jest
      .fn<() => Promise<Array<{ datasetId: string }>>>()
      .mockResolvedValue(publishedDatasetIds.map((datasetId) => ({ datasetId })));
    const eurostatRun = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const irccCanadaRun = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const ukHomeOfficeRun = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const subject = new InitialIngestionService(
      { datasetRelease: { findMany } } as unknown as PrismaService,
      { run: eurostatRun } as unknown as EurostatIngestionRunner,
      { run: irccCanadaRun } as unknown as IrccCanadaIngestionRunner,
      { run: ukHomeOfficeRun } as unknown as UkHomeOfficeIngestionRunner,
    );

    return { subject, findMany, eurostatRun, irccCanadaRun, ukHomeOfficeRun };
  };

  it('runs every ingestion when the database has no published release', async () => {
    const { subject, findMany, eurostatRun, irccCanadaRun, ukHomeOfficeRun } = createSubject([]);

    await subject.runMissing();

    expect(findMany).toHaveBeenCalledWith({
      where: {
        datasetId: {
          in: [EUROSTAT_DATASET_ID, IRCC_CANADA_DATASET_ID, UK_HOME_OFFICE_DATASET_ID],
        },
        status: ReleaseStatus.PUBLISHED,
      },
      select: { datasetId: true },
      distinct: ['datasetId'],
    });
    expect(eurostatRun).toHaveBeenCalledTimes(1);
    expect(irccCanadaRun).toHaveBeenCalledTimes(1);
    expect(ukHomeOfficeRun).toHaveBeenCalledTimes(1);
  });

  it('runs only datasets without a published release', async () => {
    const { subject, eurostatRun, irccCanadaRun, ukHomeOfficeRun } = createSubject([
      EUROSTAT_DATASET_ID,
      UK_HOME_OFFICE_DATASET_ID,
    ]);

    await subject.runMissing();

    expect(eurostatRun).not.toHaveBeenCalled();
    expect(irccCanadaRun).toHaveBeenCalledTimes(1);
    expect(ukHomeOfficeRun).not.toHaveBeenCalled();
  });
});
