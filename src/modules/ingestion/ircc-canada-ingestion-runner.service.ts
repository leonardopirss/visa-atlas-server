import { Injectable } from '@nestjs/common';
import { ReleaseStatus } from '@prisma/client';
import { IrccCanadaAdapter } from './adapters/ircc-canada/ircc-canada.adapter.js';
import { IrccCanadaClient } from './adapters/ircc-canada/ircc-canada.client.js';
import {
  IRCC_CANADA_DATASET_ID,
  IRCC_CANADA_STUDY_DATASET_ID,
} from './adapters/ircc-canada/ircc-canada.config.js';
import { IrccCanadaReferenceDataService } from './adapters/ircc-canada/ircc-canada-reference-data.service.js';
import { IrccCanadaStudyAdapter } from './adapters/ircc-canada/ircc-canada-study.adapter.js';
import { IrccCanadaWorkbookReader } from './adapters/ircc-canada/ircc-canada-workbook.reader.js';
import { IngestionService } from './ingestion.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { IngestionValidationError } from './validation/ingestion-validation.error.js';
import { IrccCanadaObservationValidator } from './validation/ircc-canada-observation.validator.js';
import { IrccCanadaStudyObservationValidator } from './validation/ircc-canada-study-observation.validator.js';

export interface IrccCanadaIngestionResult {
  releaseId: string;
  duplicate: boolean;
  published: boolean;
  observationCount: number;
  sourcePublishedAt: string | null;
}

@Injectable()
export class IrccCanadaIngestionRunner {
  constructor(
    private readonly client: IrccCanadaClient,
    private readonly reader: IrccCanadaWorkbookReader,
    private readonly adapter: IrccCanadaAdapter,
    private readonly studyAdapter: IrccCanadaStudyAdapter,
    private readonly validator: IrccCanadaObservationValidator,
    private readonly studyValidator: IrccCanadaStudyObservationValidator,
    private readonly referenceData: IrccCanadaReferenceDataService,
    private readonly ingestion: IngestionService,
    private readonly publisher: PublishReleaseService,
  ) {}

  async run(): Promise<IrccCanadaIngestionResult> {
    const release = await this.client.fetchBrazilWorkRelease();
    const observations = this.adapter.parse(this.reader.read(release.workbook));
    this.validator.validate(observations);
    await this.referenceData.synchronize();
    const staged = await this.ingestion.stage({
      datasetId: IRCC_CANADA_DATASET_ID,
      rawPayload: release.rawPayload,
      fetchedAt: release.fetchedAt,
      sourcePublishedAt: release.sourcePublishedAt,
      observations,
    });
    if (staged.status === ReleaseStatus.REJECTED) {
      throw new IngestionValidationError('IRCC_CANADA_RELEASE_PREVIOUSLY_REJECTED');
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

  async runStudy(): Promise<IrccCanadaIngestionResult> {
    const release = await this.client.fetchBrazilStudyRelease();
    const observations = this.studyAdapter.parse(this.reader.read(release.workbook));
    this.studyValidator.validate(observations);
    await this.referenceData.synchronize();
    const staged = await this.ingestion.stage({
      datasetId: IRCC_CANADA_STUDY_DATASET_ID,
      rawPayload: release.rawPayload,
      fetchedAt: release.fetchedAt,
      sourcePublishedAt: release.sourcePublishedAt,
      observations,
    });
    if (staged.status === ReleaseStatus.REJECTED) {
      throw new IngestionValidationError('IRCC_CANADA_STUDY_RELEASE_PREVIOUSLY_REJECTED');
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
