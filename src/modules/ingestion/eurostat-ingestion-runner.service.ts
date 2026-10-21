import { Injectable } from '@nestjs/common';
import { ReleaseStatus } from '@prisma/client';
import {
  EUROSTAT_BRAZIL_WORK_CONFIG,
  EUROSTAT_DATASET_ID,
} from './adapters/eurostat/eurostat.config.js';
import { EurostatAdapter } from './adapters/eurostat/eurostat.adapter.js';
import { EurostatClient } from './adapters/eurostat/eurostat.client.js';
import { EurostatReferenceDataService } from './adapters/eurostat/eurostat-reference-data.service.js';
import { IngestionService } from './ingestion.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { IngestionValidationError } from './validation/ingestion-validation.error.js';

export interface EurostatIngestionResult {
  releaseId: string;
  duplicate: boolean;
  published: boolean;
  observationCount: number;
  sourcePublishedAt: string | null;
}

@Injectable()
export class EurostatIngestionRunner {
  constructor(
    private readonly client: EurostatClient,
    private readonly referenceData: EurostatReferenceDataService,
    private readonly adapter: EurostatAdapter,
    private readonly ingestion: IngestionService,
    private readonly publisher: PublishReleaseService,
  ) {}

  async run(): Promise<EurostatIngestionResult> {
    const release = await this.client.fetchBrazilWorkRelease();
    const observations = this.adapter.parse(release.payload, EUROSTAT_BRAZIL_WORK_CONFIG);
    await this.referenceData.synchronize();
    const staged = await this.ingestion.stage({
      datasetId: EUROSTAT_DATASET_ID,
      rawPayload: release.rawPayload,
      fetchedAt: release.fetchedAt,
      sourcePublishedAt: release.sourcePublishedAt,
      observations,
    });

    if (staged.status === ReleaseStatus.REJECTED) {
      throw new IngestionValidationError('EUROSTAT_RELEASE_PREVIOUSLY_REJECTED');
    }
    const shouldPublish = staged.status === ReleaseStatus.VERIFIED;
    if (shouldPublish) await this.publisher.publish(staged.releaseId);

    return {
      releaseId: staged.releaseId,
      duplicate: staged.duplicate,
      published: shouldPublish,
      observationCount: observations.length,
      sourcePublishedAt: release.sourcePublishedAt?.toISOString() ?? null,
    };
  }
}
