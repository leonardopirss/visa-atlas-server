import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Injectable()
export class IngestionHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getInternalStatus() {
    const latestJob = await this.prisma.ingestionJob.findFirst({ orderBy: { startedAt: 'desc' } });
    return {
      status: latestJob?.status === 'RUNNING' ? 'DEGRADED' : 'OK',
      latestJobStatus: latestJob?.status ?? null,
      latestJobFinishedAt: latestJob?.finishedAt?.toISOString() ?? null,
    };
  }
}
