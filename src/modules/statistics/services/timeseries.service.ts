import { Injectable } from '@nestjs/common';
import type { Prisma, VisaPurposeCode } from '@prisma/client';
import type { TimeseriesQueryDto } from '../../../common/dto/statistics-query.dto.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import {
  IncompatibleDimensionsError,
  ResourceNotFoundError,
} from '../../../common/errors/domain.error.js';
import { presentAggregateStatistic } from './statistic.presenter.js';

const OBSERVATION_INCLUDE = {
  release: { include: { dataset: { include: { organization: true } } } },
} satisfies Prisma.MetricObservationInclude;

@Injectable()
export class TimeseriesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(iso3: string, query: TimeseriesQueryDto) {
    const country = await this.prisma.country.findUnique({ where: { iso3 } });
    if (!country) throw new ResourceNotFoundError('Country');
    if (
      query.fromYear !== undefined &&
      query.toYear !== undefined &&
      query.fromYear > query.toYear
    ) {
      throw new IncompatibleDimensionsError('fromYear must be less than or equal to toYear');
    }

    const groups = await this.prisma.comparisonGroup.findMany({
      where: {
        citizenshipIso3: query.citizenship,
        purposeCode: query.purpose as VisaPurposeCode,
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
        citizenship: query.citizenship,
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
      citizenship: query.citizenship,
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
}
