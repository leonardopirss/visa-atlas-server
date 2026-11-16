import { Injectable, Logger } from '@nestjs/common';
import { ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service.js';
import { EUROSTAT_DATASET_ID } from './adapters/eurostat/eurostat.config.js';
import { IRCC_CANADA_DATASET_ID } from './adapters/ircc-canada/ircc-canada.config.js';
import { UK_HOME_OFFICE_DATASET_ID } from './adapters/uk-home-office/uk-home-office.config.js';
import { EurostatIngestionRunner } from './eurostat-ingestion-runner.service.js';
import { IrccCanadaIngestionRunner } from './ircc-canada-ingestion-runner.service.js';
import { UkHomeOfficeIngestionRunner } from './uk-home-office-ingestion-runner.service.js';

interface InitialIngestion {
  readonly datasetId: string;
  run(): Promise<unknown>;
}

@Injectable()
export class InitialIngestionService {
  private readonly logger = new Logger(InitialIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eurostat: EurostatIngestionRunner,
    private readonly irccCanada: IrccCanadaIngestionRunner,
    private readonly ukHomeOffice: UkHomeOfficeIngestionRunner,
  ) {}

  async runMissing(): Promise<void> {
    const ingestions: readonly InitialIngestion[] = [
      { datasetId: EUROSTAT_DATASET_ID, run: () => this.eurostat.run() },
      { datasetId: IRCC_CANADA_DATASET_ID, run: () => this.irccCanada.run() },
      { datasetId: UK_HOME_OFFICE_DATASET_ID, run: () => this.ukHomeOffice.run() },
    ];
    const published = await this.prisma.datasetRelease.findMany({
      where: {
        datasetId: { in: ingestions.map(({ datasetId }) => datasetId) },
        status: ReleaseStatus.PUBLISHED,
      },
      select: { datasetId: true },
      distinct: ['datasetId'],
    });
    const publishedDatasetIds = new Set(published.map(({ datasetId }) => datasetId));

    for (const ingestion of ingestions) {
      if (publishedDatasetIds.has(ingestion.datasetId)) {
        this.logger.log(
          JSON.stringify({ event: 'initial-ingestion.skipped', datasetId: ingestion.datasetId }),
        );
        continue;
      }

      this.logger.log(
        JSON.stringify({ event: 'initial-ingestion.started', datasetId: ingestion.datasetId }),
      );
      await ingestion.run();
      this.logger.log(
        JSON.stringify({ event: 'initial-ingestion.finished', datasetId: ingestion.datasetId }),
      );
    }
  }
}
