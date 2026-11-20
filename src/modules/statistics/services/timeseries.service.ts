import { Injectable, Optional } from '@nestjs/common';
import { RedisCacheService } from '../../../common/cache/redis-cache.service.js';
import type { TimeseriesQueryDto } from '../../../common/dto/statistics-query.dto.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { QueryConcurrencyService } from '../../../common/database/query-concurrency.service.js';
import {
  IncompatibleDimensionsError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error.js';
import { OBSERVATION_INCLUDE, presentAggregateStatistic } from './statistic.presenter.js';
import { PublishedReleaseVersionService } from './published-release-version.service.js';

@Injectable()
export class TimeseriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly cache?: RedisCacheService,
    @Optional() private readonly releaseVersion?: PublishedReleaseVersionService,
    @Optional() private readonly queryConcurrency?: QueryConcurrencyService,
  ) {}

  async get(iso3: string, query: TimeseriesQueryDto) {
    if (!this.cache?.isEnabled || !this.releaseVersion) {
      return this.runLoad(() => this.load(iso3, query));
    }
    const version = await this.releaseVersion.current();
    return this.cache.getOrLoad({
      group: 'timeseries',
      route: 'country-timeseries',
      releaseVersion: version,
      query: { iso3, ...query },
      load: () => this.runLoad(() => this.load(iso3, query)),
    });
  }

  private runLoad<T>(load: () => Promise<T>): Promise<T> {
    return this.queryConcurrency ? this.queryConcurrency.run(load) : load();
  }

  private async load(iso3: string, query: TimeseriesQueryDto) {
    const country = await this.prisma.country.findUnique({ where: { iso3 } });
    if (!country) throw new ResourceNotFoundError('Country');
    if (
      query.fromYear !== undefined &&
      query.toYear !== undefined &&
      query.fromYear > query.toYear
    ) {
      throw new IncompatibleDimensionsError('fromYear must be less than or equal to toYear');
    }

    const filters = this.resolvePopulation(query);
    const groups = await this.prisma.comparisonGroup.findMany({
      where: {
        populationBasis: filters.populationBasis,
        populationKey: filters.populationKey,
        programKey: filters.programKey,
        purposeCode: query.purpose,
        metricType: query.metricType,
        ...(query.comparisonGroupId ? { id: query.comparisonGroupId } : {}),
        observations: {
          some: { destinationIso3: iso3, release: { status: 'PUBLISHED' } },
        },
      },
      orderBy: { period: 'asc' },
    });

    if (groups.length === 0) {
      return {
        iso3,
        citizenship: filters.citizenship,
        populationBasis: filters.populationBasis,
        programKey: filters.programKey,
        purpose: query.purpose,
        metricType: query.metricType,
        comparisonGroupId: query.comparisonGroupId ?? null,
        points: [],
      };
    }

    const first = groups[0];
    if (!first) throw new IncompatibleDimensionsError();
    const comparable = groups.filter(
      (group) =>
        group.datasetId === first.datasetId &&
        group.unit === first.unit &&
        group.methodologyVersion === first.methodologyVersion,
    );
    if (comparable.length !== groups.length) {
      throw new IncompatibleDimensionsError(
        'Published periods do not share one methodology and unit',
      );
    }

    const from = query.fromYear ?? Number.NEGATIVE_INFINITY;
    const to = query.toYear ?? Number.POSITIVE_INFINITY;
    const selectedGroups = comparable.filter((group) => {
      const year = Number(group.period);
      return Number.isInteger(year) && year >= from && year <= to;
    });
    const observations = await this.prisma.metricObservation.findMany({
      where: {
        destinationIso3: iso3,
        comparisonGroupId: { in: selectedGroups.map(({ id }) => id) },
        release: { status: 'PUBLISHED' },
      },
      include: OBSERVATION_INCLUDE,
      orderBy: { period: 'asc' },
    });

    return {
      iso3,
      citizenship: filters.citizenship,
      populationBasis: filters.populationBasis,
      programKey: filters.programKey,
      purpose: query.purpose,
      metricType: query.metricType,
      comparisonGroupId: query.comparisonGroupId ?? null,
      points: [...new Set(observations.map(({ period }) => period))].map((period) => ({
        year: Number(period),
        statistic: presentAggregateStatistic(
          observations.filter((observation) => observation.period === period),
        ),
      })),
    };
  }

  private resolvePopulation(query: TimeseriesQueryDto) {
    const populationBasis = query.populationBasis ?? 'CITIZENSHIP';
    const citizenship = populationBasis === 'NATIONAL' ? null : (query.citizenship ?? 'BRA');
    return {
      populationBasis,
      populationKey: citizenship ?? 'ALL',
      programKey: query.programKey ?? 'ALL',
      citizenship,
    } as const;
  }
}
