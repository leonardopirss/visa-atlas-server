import { MetricType, VisaPurposeCode } from '@prisma/client';

export const IRCC_CANADA_DATASET_PAGE_URL =
  'https://open.canada.ca/data/en/dataset/360024f2-17e9-4558-bfc1-3616485d65b9';
export const IRCC_CANADA_WORKBOOK_URL =
  'https://www.ircc.canada.ca/opendata-donneesouvertes/data/en_odp_annual-tr-work-imp_citz_year_end.xlsx';
export const IRCC_CANADA_DATASET_ID = 'ircc-imp-year-end-citizenship';
export const IRCC_CANADA_DATASET_CODE = 'IMP_CITZ_YEAR_END_WORK';
export const IRCC_CANADA_SOURCE_ORGANIZATION_ID = 'ircc-canada';
export const IRCC_CANADA_SCHEMA_VERSION = 'imp-work-purpose-year-end-v1';

export const IRCC_CANADA_CONFIG = {
  destinationIso3: 'CAN',
  citizenshipIso3: 'BRA',
  citizenshipLabel: 'Brazil',
  metricType: MetricType.VALID_PERMIT_HOLDERS,
  purpose: VisaPurposeCode.WORK,
  unit: 'HOLDERS',
  sourceCategoryCode: 'IMP',
  sourceCategoryLabel: 'International Mobility Program (IMP) — finalidade de trabalho',
  methodologyVersion: IRCC_CANADA_SCHEMA_VERSION,
} as const;
