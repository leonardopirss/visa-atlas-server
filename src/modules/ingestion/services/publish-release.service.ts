import { Injectable } from '@nestjs/common';
import { ReleaseStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { IngestionValidationError } from '../validation/ingestion-validation.error.js';

@Injectable()
export class PublishReleaseService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(releaseId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const release = await transaction.datasetRelease.findUnique({ where: { id: releaseId } });
      if (!release || release.status !== ReleaseStatus.VERIFIED) {
        throw new IngestionValidationError('RELEASE_NOT_VERIFIED');
      }
      await transaction.datasetRelease.updateMany({
        where: { datasetId: release.datasetId, status: ReleaseStatus.PUBLISHED },
        data: { status: ReleaseStatus.VERIFIED },
      });
      await transaction.datasetRelease.update({
        where: { id: releaseId },
        data: { status: ReleaseStatus.PUBLISHED, publishedAt: new Date() },
      });
    });
  }

  async rollbackTo(releaseId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const target = await transaction.datasetRelease.findUnique({ where: { id: releaseId } });
      if (
        !target ||
        (target.status !== ReleaseStatus.VERIFIED && target.status !== ReleaseStatus.PUBLISHED)
      ) {
        throw new IngestionValidationError('ROLLBACK_TARGET_INVALID');
      }
      await transaction.datasetRelease.updateMany({
        where: { datasetId: target.datasetId, status: ReleaseStatus.PUBLISHED },
        data: { status: ReleaseStatus.VERIFIED },
      });
      await transaction.datasetRelease.update({
        where: { id: releaseId },
        data: { status: ReleaseStatus.PUBLISHED, publishedAt: new Date() },
      });
    });
  }
}
