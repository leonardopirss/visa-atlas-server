import { Injectable, Optional } from '@nestjs/common';
import { DataStatus, type VisaPurposeCode } from '@prisma/client';
import { RedisCacheService } from '../../common/cache/redis-cache.service.js';
import type { Statistic } from '../../common/contracts/public-api.types.js';
import type { StatisticsQueryDto } from '../../common/dto/statistics-query.dto.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { QueryConcurrencyService } from '../../common/database/query-concurrency.service.js';
import { DefaultFiltersService } from './services/default-filters.service.js';
import { PublishedReleaseVersionService } from './services/published-release-version.service.js';
import { OBSERVATION_INCLUDE, presentAggregateStatistic } from './services/statistic.presenter.js';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultFilters: DefaultFiltersService,
    @Optional() private readonly cache?: RedisCacheService,
    @Optional() private readonly releaseVersion?: PublishedReleaseVersionService,
    @Optional() private readonly queryConcurrency?: QueryConcurrencyService,
  ) {}

  async getMap(query: StatisticsQueryDto): Promise<{
    citizenship: string | null;
    populationBasis: 'CITIZENSHIP' | 'NATIONAL';
    programKey: string;
    purpose: VisaPurposeCode;
    year: number | null;
    countries: Array<{ iso3: string; statistic: Statistic }>;
    legendLabel: string;
  }> {
    if (!this.cache?.isEnabled || !this.releaseVersion) {
      return this.runLoad(() => this.loadMap(query));
    }
    const version = await this.releaseVersion.current();
    return this.cache.getOrLoad({
      group: 'map',
      route: 'stats-map',
      releaseVersion: version,
      query,
      load: () => this.runLoad(() => this.loadMap(query)),
    });
  }

  private runLoad<T>(load: () => Promise<T>): Promise<T> {
    return this.queryConcurrency ? this.queryConcurrency.run(load) : load();
  }

  private async loadMap(query: StatisticsQueryDto): Promise<{
    citizenship: string | null;
    populationBasis: 'CITIZENSHIP' | 'NATIONAL';
    programKey: string;
    purpose: VisaPurposeCode;
    year: number | null;
    countries: Array<{ iso3: string; statistic: Statistic }>;
    legendLabel: string;
  }> {
    const filters = await this.defaultFilters.resolve({
      ...(query.citizenship === undefined ? {} : { citizenship: query.citizenship }),
      ...(query.populationBasis === undefined ? {} : { populationBasis: query.populationBasis }),
      ...(query.programKey === undefined ? {} : { programKey: query.programKey }),
      purpose: query.purpose,
      metricType: query.metricType,
      ...(query.year === undefined ? {} : { year: query.year }),
      ...(query.comparisonGroupId === undefined
        ? {}
        : { comparisonGroupId: query.comparisonGroupId }),
    });
    const countries = await this.prisma.country.findMany({ orderBy: { namePt: 'asc' } });
    const observations = filters.comparisonGroupId
      ? await this.prisma.metricObservation.findMany({
          where: {
            comparisonGroupId: filters.comparisonGroupId,
            release: { status: 'PUBLISHED' },
          },
          include: OBSERVATION_INCLUDE,
        })
      : [];
    const byCountry = new Map<string, (typeof observations)[number][]>();
    for (const observation of observations) {
      const current = byCountry.get(observation.destinationIso3) ?? [];
      current.push(observation);
      byCountry.set(observation.destinationIso3, current);
    }

    return {
      citizenship: filters.citizenship,
      populationBasis: filters.populationBasis,
      programKey: filters.programKey,
      purpose: filters.purpose,
      year: filters.year,
      countries: countries.map(({ iso3 }) => {
        const observation = byCountry.get(iso3);
        return {
          iso3,
          statistic: observation
            ? presentAggregateStatistic(observation)
            : this.unavailableStatistic(
                filters.metricType,
                filters.year,
                filters.comparisonGroupId,
                filters.unit,
              ),
        };
      }),
      legendLabel: this.legendLabel(filters.metricType, filters.purpose),
    };
  }

  private legendLabel(
    metricType: StatisticsQueryDto['metricType'],
    purpose: VisaPurposeCode,
  ): string {
    if (metricType === 'WORK_VISAS_ISSUED') {
      return 'Vistos de trabalho emitidos; volume administrativo, não probabilidade';
    }
    if (metricType === 'VALID_PERMIT_HOLDERS') {
      return purpose === 'STUDY'
        ? 'Titulares brasileiros com permissão de estudo válida em 31 de dezembro; volume administrativo, não probabilidade'
        : 'Titulares brasileiros do IMP com permissão de trabalho válida em 31 de dezembro; valores arredondados pela fonte';
    }
    if (metricType === 'APPROVAL_RATE') {
      return 'Taxa derivada entre decisões emitidas e recusadas; não representa chance individual';
    }
    if (metricType === 'REFUSAL_RATE') {
      return 'Taxa derivada entre decisões recusadas e emitidas; não representa chance individual';
    }
    return purpose === 'STUDY'
      ? 'Primeiras autorizações de residência por educação; não representa vistos consulares'
      : 'Primeiras autorizações de residência por trabalho; não representa vistos consulares';
  }

  private unavailableStatistic(
    metricType: StatisticsQueryDto['metricType'],
    year: number | null,
    comparisonGroupId: string | null,
    unit: string | null,
  ): Statistic {
    return {
      metricType,
      value: null,
      dataStatus: DataStatus.UNAVAILABLE,
      freshness: 'CURRENT',
      unit: unit ?? 'COUNT',
      period: year?.toString() ?? '',
      comparisonGroupId,
      source: null,
    };
  }
}
