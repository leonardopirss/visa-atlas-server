import { Injectable } from '@nestjs/common';
import { ReleaseStatus } from '@prisma/client';
import { UkHomeOfficeAdapter } from './adapters/uk-home-office/uk-home-office.adapter.js';
import { UkHomeOfficeClient } from './adapters/uk-home-office/uk-home-office.client.js';
import { UK_HOME_OFFICE_DATASET_ID } from './adapters/uk-home-office/uk-home-office.config.js';
import { UkHomeOfficeReferenceDataService } from './adapters/uk-home-office/uk-home-office-reference-data.service.js';
import { UkHomeOfficeWorkbookReader } from './adapters/uk-home-office/uk-home-office-workbook.reader.js';
import { IngestionService } from './ingestion.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { IngestionValidationError } from './validation/ingestion-validation.error.js';
import { UkHomeOfficeObservationValidator } from './validation/uk-home-office-observation.validator.js';

export interface UkHomeOfficeIngestionResult {
  releaseId: string;
  duplicate: boolean;
  published: boolean;
  observationCount: number;
  sourceUrl: string;
  sourcePublishedAt: string | null;
}

@Injectable()
export class UkHomeOfficeIngestionRunner {
  constructor(
    private readonly client: UkHomeOfficeClient,
    private readonly reader: UkHomeOfficeWorkbookReader,
    private readonly adapter: UkHomeOfficeAdapter,
    private readonly validator: UkHomeOfficeObservationValidator,
    private readonly referenceData: UkHomeOfficeReferenceDataService,
    private readonly ingestion: IngestionService,
    private readonly publisher: PublishReleaseService,
  ) {}

  async run(sourceUrl?: string): Promise<UkHomeOfficeIngestionResult> {
    const release = await this.client.fetchBrazilWorkRelease(sourceUrl);
    const rows = this.reader.read(release.workbook);
    const observations = this.adapter.parse(rows);
    this.validator.validate(observations);
    await this.referenceData.synchronize();
    const staged = await this.ingestion.stage({
      datasetId: UK_HOME_OFFICE_DATASET_ID,
      rawPayload: release.rawPayload,
      fetchedAt: release.fetchedAt,
      sourcePublishedAt: release.sourcePublishedAt,
      observations,
    });
    if (staged.status === ReleaseStatus.REJECTED) {
      throw new IngestionValidationError('UK_HOME_OFFICE_RELEASE_PREVIOUSLY_REJECTED');
    }
    const shouldPublish = staged.status === ReleaseStatus.VERIFIED;
    if (shouldPublish) await this.publisher.publish(staged.releaseId);
    return {
      releaseId: staged.releaseId,
      duplicate: staged.duplicate,
      published: shouldPublish,
      observationCount: observations.length,
      sourceUrl: release.sourceUrl,
      sourcePublishedAt: release.sourcePublishedAt?.toISOString() ?? null,
    };
  }
}
