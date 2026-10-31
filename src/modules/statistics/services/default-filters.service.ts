import { Injectable, Optional } from '@nestjs/common';
import type { MetricType, VisaPurposeCode } from '@prisma/client';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import {
  DEFAULT_CITIZENSHIP,
  DEFAULT_METRIC_TYPE,
  DEFAULT_PURPOSE,
} from '../../../common/contracts/public-api.types.js';
import { IncompatibleDimensionsError } from '../../../common/errors/domain.error.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { PublishedReleaseVersionService } from './published-release-version.service.js';

export interface ResolvedFilters {
  citizenship: string;
  purpose: VisaPurposeCode;
  year: number | null;
  metricType: MetricType;
  comparisonGroupId: string | null;
  unit: string | null;
}

export interface FilterRequest {
  citizenship: string;
  purpose: VisaPurposeCode;
  metricType: MetricType;
  year?: number;
  comparisonGroupId?: string;
}

@Injectable()
export class DefaultFiltersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: RedisCacheService,
    @Optional() private readonly releaseVersion?: PublishedReleaseVersionService,
  ) {}

  async getDefaults(): Promise<ResolvedFilters & { dataAvailable: boolean }> {
    if (!this.cache?.isEnabled || !this.releaseVersion) return this.loadDefaults();
    const version = await this.releaseVersion.current();
    return this.cache.getOrLoad({
      group: 'defaults',
      route: 'filter-defaults',
      releaseVersion: version,
      query: {},
      load: () => this.loadDefaults(),
    });
  }

  private async loadDefaults(): Promise<ResolvedFilters & { dataAvailable: boolean }> {
    const filters = await this.resolve({
      citizenship: DEFAULT_CITIZENSHIP,
      purpose: DEFAULT_PURPOSE,
      metricType: DEFAULT_METRIC_TYPE,
    });
    return { ...filters, dataAvailable: filters.year !== null };
  }

  async resolve(request: FilterRequest): Promise<ResolvedFilters> {
    const period = request.year?.toString();
    const group = request.comparisonGroupId
      ? await this.prisma.comparisonGroup.findFirst({
          where: {
            id: request.comparisonGroupId,
            observations: { some: { release: { status: 'PUBLISHED' } } },
          },
        })
      : await this.prisma.comparisonGroup.findFirst({
          where: {
            citizenshipIso3: request.citizenship,
            purposeCode: request.purpose,
            metricType: request.metricType,
            ...(period ? { period } : {}),
            observations: { some: { release: { status: 'PUBLISHED' } } },
          },
          orderBy: { period: 'desc' },
        });

    if (!group) {
      if (request.comparisonGroupId || request.year !== undefined) {
        throw new IncompatibleDimensionsError();
      }
      return {
        citizenship: request.citizenship,
        purpose: request.purpose,
        year: null,
        metricType: request.metricType,
        comparisonGroupId: null,
        unit: null,
      };
    }
    if (
      group.citizenshipIso3 !== request.citizenship ||
      group.purposeCode !== request.purpose ||
      group.metricType !== request.metricType ||
      (period !== undefined && group.period !== period)
    ) {
      throw new IncompatibleDimensionsError();
    }

    const year = Number(group.period);
    if (!Number.isInteger(year))
      throw new IncompatibleDimensionsError('Group period is not annual');
    return {
      citizenship: request.citizenship,
      purpose: request.purpose,
      year,
      metricType: request.metricType,
      comparisonGroupId: group.id,
      unit: group.unit,
    };
  }
}
