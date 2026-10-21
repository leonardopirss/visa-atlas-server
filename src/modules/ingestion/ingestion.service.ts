import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { IngestionJobStatus, ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { StagedObservation } from './adapters/eurostat/eurostat.types.js';
import { IngestionLogger } from './observability/ingestion-logger.service.js';
import { ObservationValidator } from './validation/observation.validator.js';

export interface StageReleaseInput {
  datasetId: string;
  rawPayload: string;
  fetchedAt: Date;
  sourcePublishedAt: Date | null;
  observations: readonly StagedObservation[];
}

export interface StageReleaseResult {
  releaseId: string;
  duplicate: boolean;
  status: ReleaseStatus;
}

@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: ObservationValidator,
    private readonly logger: IngestionLogger,
  ) {}

  async stage(input: StageReleaseInput): Promise<StageReleaseResult> {
    const checksum = createHash('sha256').update(input.rawPayload).digest('hex');
    const existing = await this.prisma.datasetRelease.findUnique({
      where: { datasetId_checksum: { datasetId: input.datasetId, checksum } },
    });
    if (existing) return { releaseId: existing.id, duplicate: true, status: existing.status };

    const job = await this.prisma.ingestionJob.create({
      data: {
        sourceDatasetId: input.datasetId,
        startedAt: new Date(),
        status: IngestionJobStatus.RUNNING,
      },
    });
    this.logger.started(job.id, input.datasetId);

    try {
      this.validator.validate(input.observations);
      const observations = this.deduplicate(input.observations);
      const release = await this.prisma.$transaction(async (transaction) => {
        const stagedRelease = await transaction.datasetRelease.create({
          data: {
            datasetId: input.datasetId,
            sourcePublishedAt: input.sourcePublishedAt,
            fetchedAt: input.fetchedAt,
            checksum,
            status: ReleaseStatus.STAGING,
          },
        });
        for (const observation of observations) {
          const comparisonGroupId = this.comparisonGroupId(input.datasetId, observation);
          await transaction.comparisonGroup.upsert({
            where: { id: comparisonGroupId },
            create: {
              id: comparisonGroupId,
              datasetId: input.datasetId,
              metricType: observation.metricType,
              citizenshipIso3: observation.citizenshipIso3,
              purposeCode: observation.purpose,
              period: observation.period,
              unit: observation.unit,
              methodologyVersion: observation.methodologyVersion,
            },
            update: {},
          });
          await transaction.metricObservation.create({
            data: {
              releaseId: stagedRelease.id,
              destinationIso3: observation.destinationIso3,
              citizenshipIso3: observation.citizenshipIso3,
              purposeCode: observation.purpose,
              metricType: observation.metricType,
              sourceCategoryCode: observation.sourceCategoryCode,
              sourceCategoryLabel: observation.sourceCategoryLabel,
              period: observation.period,
              unit: observation.unit,
              value: observation.value,
              dataStatus: observation.dataStatus,
              comparisonGroupId,
            },
          });
        }
        return transaction.datasetRelease.update({
          where: { id: stagedRelease.id },
          data: {
            status: ReleaseStatus.VERIFIED,
            validatedAt: new Date(),
            qualityReport: { observationCount: observations.length, validation: 'passed' },
          },
        });
      });
      await this.prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: IngestionJobStatus.SUCCEEDED,
          finishedAt: new Date(),
          report: { releaseId: release.id, observationCount: observations.length },
        },
      });
      this.logger.completed(job.id, release.id, observations.length);
      return { releaseId: release.id, duplicate: false, status: release.status };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'Unknown ingestion failure';
      await this.prisma.ingestionJob.update({
        where: { id: job.id },
        data: {
          status: IngestionJobStatus.FAILED,
          finishedAt: new Date(),
          report: { reason },
        },
      });
      await this.prisma.datasetRelease.upsert({
        where: { datasetId_checksum: { datasetId: input.datasetId, checksum } },
        create: {
          datasetId: input.datasetId,
          sourcePublishedAt: input.sourcePublishedAt,
          fetchedAt: input.fetchedAt,
          checksum,
          status: ReleaseStatus.REJECTED,
          qualityReport: { reason },
        },
        update: {},
      });
      this.logger.failed(job.id, reason);
      throw error;
    }
  }

  private deduplicate(observations: readonly StagedObservation[]): StagedObservation[] {
    const unique = new Map<string, StagedObservation>();
    for (const observation of observations) {
      const key = [
        observation.destinationIso3,
        observation.citizenshipIso3,
        observation.purpose,
        observation.metricType,
        observation.sourceCategoryCode,
        observation.period,
        observation.unit,
      ].join('|');
      const existing = unique.get(key);
      if (
        existing &&
        JSON.stringify(existing, this.bigIntReplacer) !==
          JSON.stringify(observation, this.bigIntReplacer)
      ) {
        throw new Error(`Conflicting duplicate observation: ${key}`);
      }
      unique.set(key, observation);
    }
    return [...unique.values()];
  }

  private comparisonGroupId(datasetId: string, observation: StagedObservation): string {
    return createHash('sha256')
      .update(
        [
          datasetId,
          observation.metricType,
          observation.citizenshipIso3,
          observation.purpose,
          observation.period,
          observation.unit,
          observation.methodologyVersion,
        ].join('|'),
      )
      .digest('hex');
  }

  private readonly bigIntReplacer = (_key: string, value: unknown): unknown =>
    typeof value === 'bigint' ? value.toString() : value;
}
