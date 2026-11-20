import { Injectable, Optional } from '@nestjs/common';
import { PopulationBasis, type MetricType, type VisaPurposeCode } from '@prisma/client';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import type { DefaultFiltersQueryDto } from '../../../common/dto/statistics-query.dto.js';
import { DEFAULT_CITIZENSHIP } from '../../../common/contracts/public-api.types.js';
import { IncompatibleDimensionsError } from '../../../common/errors/domain.error.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { PublishedReleaseVersionService } from './published-release-version.service.js';

export interface ResolvedFilters {
  citizenship: string | null;
  populationBasis: PopulationBasis;
  populationKey: string;
  programKey: string;
  purpose: VisaPurposeCode;
  year: number | null;
  metricType: MetricType;
  comparisonGroupId: string | null;
  unit: string | null;
}

export interface FilterRequest {
  citizenship?: string;
  populationBasis?: PopulationBasis;
  programKey?: string;
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

  async getDefaults(
    request: DefaultFiltersQueryDto,
  ): Promise<ResolvedFilters & { dataAvailable: boolean }> {
    if (!this.cache?.isEnabled || !this.releaseVersion) return this.loadDefaults(request);
    const version = await this.releaseVersion.current();
    return this.cache.getOrLoad({
      group: 'defaults',
      route: 'filter-defaults',
      releaseVersion: version,
      query: request,
      load: () => this.loadDefaults(request),
    });
  }

  private async loadDefaults(
    request: DefaultFiltersQueryDto,
  ): Promise<ResolvedFilters & { dataAvailable: boolean }> {
    const filters = await this.resolve({
      ...(request.citizenship === undefined ? {} : { citizenship: request.citizenship }),
      ...(request.populationBasis === undefined
        ? {}
        : { populationBasis: request.populationBasis }),
      ...(request.programKey === undefined ? {} : { programKey: request.programKey }),
      purpose: request.purpose,
      metricType: request.metricType,
    });
    return { ...filters, dataAvailable: filters.year !== null };
  }

  async resolve(request: FilterRequest): Promise<ResolvedFilters> {
    const populationBasis = request.populationBasis ?? PopulationBasis.CITIZENSHIP;
    const citizenship =
      populationBasis === PopulationBasis.NATIONAL
        ? null
        : (request.citizenship ?? DEFAULT_CITIZENSHIP);
    const populationKey = citizenship ?? 'ALL';
    const programKey = request.programKey ?? 'ALL';
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
            populationBasis,
            populationKey,
            programKey,
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
        citizenship,
        populationBasis,
        populationKey,
        programKey,
        purpose: request.purpose,
        year: null,
        metricType: request.metricType,
        comparisonGroupId: null,
        unit: null,
      };
    }
    if (
      group.populationBasis !== populationBasis ||
      group.populationKey !== populationKey ||
      group.programKey !== programKey ||
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
      citizenship,
      populationBasis,
      populationKey,
      programKey,
      purpose: request.purpose,
      year,
      metricType: request.metricType,
      comparisonGroupId: group.id,
      unit: group.unit,
    };
  }
}
