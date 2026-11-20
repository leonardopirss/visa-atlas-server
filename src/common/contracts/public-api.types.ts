import {
  DataStatus,
  MetricType,
  PopulationBasis,
  SponsorshipRequirement,
  VisaPurposeCode,
} from '@prisma/client';

export { DataStatus, MetricType, PopulationBasis, SponsorshipRequirement, VisaPurposeCode };

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
  populationScope?: PopulationScope;
  derivation?: MetricDerivation;
  measurement?: MeasurementMetadata;
}

export type PopulationScope =
  | {
      basis: typeof PopulationBasis.CITIZENSHIP;
      populationKey: string;
      citizenshipIso3: string;
      programKey: string;
      label: string;
    }
  | {
      basis: typeof PopulationBasis.NATIONAL;
      populationKey: 'ALL';
      programKey: string;
      label: string;
    };

export interface DerivationOperand {
  observationId: string;
  metricType: MetricType;
  value: number;
  unit: 'COUNT';
  period: string;
  releaseId: string;
  comparisonGroupId: string;
  sourceCategoryCode: string;
  coefficient: 1;
}

export interface MetricDerivation {
  formula: 'APPROVAL_RATE' | 'REFUSAL_RATE';
  numerator: DerivationOperand[];
  denominator: DerivationOperand[];
  precision: 2;
}

export interface MeasurementMetadata {
  approximate: boolean;
  roundingIncrement?: number | null;
  precision?: number | null;
}

export interface CountryDto {
  iso3: string;
  iso2: string;
  name: string;
  region: string;
}

export const DEFAULT_CITIZENSHIP = 'BRA';
export const DEFAULT_PURPOSE = VisaPurposeCode.WORK;
export const DEFAULT_METRIC_TYPE = MetricType.FIRST_RESIDENCE_PERMITS_GRANTED;
