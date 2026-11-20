import { Injectable } from '@nestjs/common';
import { ReleaseStatus } from '@prisma/client';
import { VisaDecisionAdapter } from './adapters/visa-insights/visa-decision.adapter.js';
import { VISA_DECISION_DATASET_ID } from './adapters/visa-insights/visa-decision.config.js';
import { VisaDecisionReferenceDataService } from './adapters/visa-insights/visa-decision-reference-data.service.js';
import type { VisaDecisionReleasePayload } from './adapters/visa-insights/visa-decision.types.js';
import { VisaDecisionWorkbookReader } from './adapters/visa-insights/visa-decision-workbook.reader.js';
import { IngestionService } from './ingestion.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { DecisionInsightValidator } from './validation/decision-insight.validator.js';
import { IngestionValidationError } from './validation/ingestion-validation.error.js';

export interface VisaDecisionRunInput {
  release: VisaDecisionReleasePayload;
  publish?: boolean;
}

export interface VisaDecisionIngestionResult {
  releaseId: string;
  duplicate: boolean;
  published: boolean;
  observationCount: number;
  sourceUrl: string;
  sourcePublishedAt: string | null;
}

@Injectable()
export class VisaDecisionIngestionRunner {
  constructor(
    private readonly reader: VisaDecisionWorkbookReader,
    private readonly adapter: VisaDecisionAdapter,
    private readonly validator: DecisionInsightValidator,
    private readonly referenceData: VisaDecisionReferenceDataService,
    private readonly ingestion: IngestionService,
    private readonly publisher: PublishReleaseService,
  ) {}

  async run({
    release,
    publish = true,
  }: VisaDecisionRunInput): Promise<VisaDecisionIngestionResult> {
    const observations = this.adapter.parse(this.reader.read(release.workbook));
    this.validator.validate(observations);
    await this.referenceData.synchronize();
    const staged = await this.ingestion.stage({
      datasetId: VISA_DECISION_DATASET_ID,
      rawPayload: release.rawPayload,
      fetchedAt: release.fetchedAt,
      sourcePublishedAt: release.sourcePublishedAt,
      observations,
    });
    if (staged.status === ReleaseStatus.REJECTED) {
      throw new IngestionValidationError('VISA_DECISION_RELEASE_PREVIOUSLY_REJECTED');
    }
    const shouldPublish = publish && staged.status === ReleaseStatus.VERIFIED;
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
