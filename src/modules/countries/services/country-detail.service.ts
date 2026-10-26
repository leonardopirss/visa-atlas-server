import { Injectable } from '@nestjs/common';
import { DataStatus, type Prisma, type VisaPurposeCode } from '@prisma/client';
import type { Statistic } from '../../../common/contracts/public-api.types.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import type { StatisticsQueryDto } from '../../../common/dto/statistics-query.dto.js';
import { ResourceNotFoundError } from '../../../common/errors/domain.error.js';
import { SourcesService } from '../../sources/sources.service.js';
import { DefaultFiltersService } from '../../statistics/services/default-filters.service.js';
import {
  presentAggregateStatistic,
  presentStatistic,
} from '../../statistics/services/statistic.presenter.js';
import { VisaProgramsService } from '../../visa-programs/visa-programs.service.js';

const OBSERVATION_INCLUDE = {
  release: { include: { dataset: { include: { organization: true } } } },
} satisfies Prisma.MetricObservationInclude;

@Injectable()
export class CountryDetailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaults: DefaultFiltersService,
    private readonly visaPrograms: VisaProgramsService,
    private readonly sources: SourcesService,
  ) {}

  async get(iso3: string, query: StatisticsQueryDto) {
    const country = await this.prisma.country.findUnique({ where: { iso3 } });
    if (!country) throw new ResourceNotFoundError('Country');
    const filters = await this.defaults.resolve({
      citizenship: query.citizenship,
      purpose: query.purpose as VisaPurposeCode,
      metricType: query.metricType,
      ...(query.year === undefined ? {} : { year: query.year }),
      ...(query.comparisonGroupId === undefined
        ? {}
        : { comparisonGroupId: query.comparisonGroupId }),
    });
    const observations = filters.comparisonGroupId
      ? await this.prisma.metricObservation.findMany({
          where: {
            destinationIso3: iso3,
            comparisonGroupId: filters.comparisonGroupId,
            release: { status: 'PUBLISHED' },
          },
          include: OBSERVATION_INCLUDE,
          orderBy: { sourceCategoryCode: 'asc' },
        })
      : [];
    const programs = await this.visaPrograms.listVerified(iso3, query.purpose as VisaPurposeCode);
    await this.sources.verifiedLinks(iso3);

    return {
      country: {
        iso3: country.iso3,
        iso2: country.iso2,
        name: country.namePt,
        region: country.region,
      },
      statistics:
        observations.length > 0
          ? presentAggregateStatistic(observations)
          : this.unavailable(
              filters.metricType,
              filters.year,
              filters.comparisonGroupId,
              filters.unit,
            ),
      classifications: observations.map((observation) => ({
        sourceCategoryCode: observation.sourceCategoryCode,
        label: observation.sourceCategoryLabel ?? observation.sourceCategoryCode,
        statistic: presentStatistic(observation),
      })),
      visaPrograms: programs,
      sources: this.sources.fromObservations(observations),
    };
  }

  private unavailable(
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
