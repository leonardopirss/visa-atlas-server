import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { SourceRef } from '../../common/contracts/public-api.types.js';

type ObservationWithSource = Prisma.MetricObservationGetPayload<{
  include: { release: { include: { dataset: { include: { organization: true } } } } };
}>;

@Injectable()
export class SourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async verifiedLinks(countryIso3: string) {
    return this.prisma.officialLink.findMany({
      where: { countryIso3, verifiedAt: { not: null } },
      include: { sourceOrganization: true },
      orderBy: { kind: 'asc' },
    });
  }

  fromObservations(observations: ObservationWithSource[]): SourceRef[] {
    const sources = new Map<string, SourceRef>();
    for (const observation of observations) {
      const { release } = observation;
      if (sources.has(release.id)) continue;
      sources.set(release.id, {
        organization: release.dataset.organization.name,
        datasetCode: release.dataset.code,
        releaseId: release.id,
        url: release.dataset.url,
        methodologyUrl: release.dataset.methodologyUrl,
        fetchedAt: release.fetchedAt.toISOString(),
        publishedAt: release.publishedAt?.toISOString() ?? null,
      });
    }
    return [...sources.values()];
  }
}
