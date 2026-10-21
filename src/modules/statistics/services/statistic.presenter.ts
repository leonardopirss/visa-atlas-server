import type { DataStatus, MetricType } from '@prisma/client';
import type { SourceRef, Statistic } from '../../../common/contracts/public-api.types.js';

export interface ObservationView {
  metricType: MetricType;
  value: bigint | null;
  dataStatus: DataStatus;
  unit: string;
  period: string;
  comparisonGroupId: string;
  release: {
    id: string;
    fetchedAt: Date;
    publishedAt: Date | null;
    dataset: {
      code: string;
      url: string;
      methodologyUrl: string | null;
      organization: { name: string };
    };
  };
}

export function presentSource(observation: ObservationView): SourceRef {
  return {
    organization: observation.release.dataset.organization.name,
    datasetCode: observation.release.dataset.code,
    releaseId: observation.release.id,
    url: observation.release.dataset.url,
    methodologyUrl: observation.release.dataset.methodologyUrl,
    fetchedAt: observation.release.fetchedAt.toISOString(),
    publishedAt: observation.release.publishedAt?.toISOString() ?? null,
  };
}

export function presentStatistic(observation: ObservationView): Statistic {
  const value = observation.value === null ? null : Number(observation.value);
  if (value !== null && !Number.isSafeInteger(value)) {
    throw new RangeError('Statistic exceeds the JSON safe integer range');
  }
  return {
    metricType: observation.metricType,
    value,
    dataStatus: observation.dataStatus,
    freshness: 'CURRENT',
    unit: observation.unit,
    period: observation.period,
    comparisonGroupId: observation.comparisonGroupId,
    source: presentSource(observation),
  };
}
