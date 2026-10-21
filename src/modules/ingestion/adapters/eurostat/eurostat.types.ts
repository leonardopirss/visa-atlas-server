import type { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';

export interface EurostatDimensionCategory {
  index: Record<string, number> | string[];
  label?: Record<string, string>;
}

export interface EurostatPayload {
  id: string[];
  size: number[];
  value: Record<string, number | null> | Array<number | null>;
  status?: Record<string, string> | string[] | null;
  dimension: Record<string, { category: EurostatDimensionCategory }>;
  updated?: string;
}

export interface EurostatAdapterConfig {
  destinationDimension: string;
  citizenshipDimension: string;
  purposeDimension: string;
  periodDimension: string;
  unitDimension: string;
  workCategoryCodes: readonly string[];
  countUnitCodes: readonly string[];
  destinationIso2ToIso3: Readonly<Record<string, string>>;
  citizenshipIso2ToIso3: Readonly<Record<string, string>>;
  metricType: MetricType;
  purpose: VisaPurposeCode;
}

export interface StagedObservation {
  destinationIso3: string;
  citizenshipIso3: string;
  purpose: VisaPurposeCode;
  metricType: MetricType;
  sourceCategoryCode: string;
  sourceCategoryLabel: string | null;
  period: string;
  unit: string;
  value: bigint | null;
  dataStatus: DataStatus;
  methodologyVersion: string;
}
