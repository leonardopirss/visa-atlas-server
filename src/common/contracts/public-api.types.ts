import { DataStatus, MetricType, SponsorshipRequirement } from '@prisma/client';

export { DataStatus, MetricType, SponsorshipRequirement };

export type Freshness = 'CURRENT' | 'STALE';

export interface SourceRef {
  organization: string;
  datasetCode: string;
  releaseId: string | null;
  url: string;
  methodologyUrl: string | null;
  fetchedAt: string | null;
  publishedAt: string | null;
}

export interface Statistic {
  metricType: MetricType;
  value: number | null;
  dataStatus: DataStatus;
  freshness: Freshness;
  unit: string;
  period: string;
  comparisonGroupId: string | null;
  source: SourceRef | null;
}

export interface CountryDto {
  iso3: string;
  iso2: string;
  name: string;
  region: string;
}

export const DEFAULT_CITIZENSHIP = 'BRA';
export const DEFAULT_PURPOSE = 'WORK' as const;
export const DEFAULT_METRIC_TYPE = MetricType.FIRST_RESIDENCE_PERMITS_GRANTED;
