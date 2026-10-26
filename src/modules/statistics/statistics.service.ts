import { Injectable } from '@nestjs/common';
import { DataStatus, type Prisma, type VisaPurposeCode } from '@prisma/client';
import type { Statistic } from '../../common/contracts/public-api.types.js';
import type { StatisticsQueryDto } from '../../common/dto/statistics-query.dto.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { DefaultFiltersService } from './services/default-filters.service.js';
import { presentAggregateStatistic } from './services/statistic.presenter.js';

const OBSERVATION_INCLUDE = {
  release: { include: { dataset: { include: { organization: true } } } },
} satisfies Prisma.MetricObservationInclude;

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaultFilters: DefaultFiltersService,
  ) {}

  async getMap(query: StatisticsQueryDto): Promise<{
    citizenship: string;
    purpose: 'WORK';
    year: number | null;
    countries: Array<{ iso3: string; statistic: Statistic }>;
    legendLabel: string;
  }> {
    const filters = await this.defaultFilters.resolve({
      citizenship: query.citizenship,
      purpose: query.purpose as VisaPurposeCode,
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
      purpose: 'WORK',
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
      legendLabel: this.legendLabel(filters.metricType),
    };
  }

  private legendLabel(metricType: StatisticsQueryDto['metricType']): string {
    if (metricType === 'WORK_VISAS_ISSUED') {
      return 'Vistos de trabalho emitidos; volume administrativo, não probabilidade';
    }
    if (metricType === 'VALID_PERMIT_HOLDERS') {
      return 'Titulares brasileiros do IMP com permissão de trabalho válida em 31 de dezembro; valores arredondados pela fonte';
    }
    return 'Primeiras autorizações de residência por trabalho; não representa vistos consulares';
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
