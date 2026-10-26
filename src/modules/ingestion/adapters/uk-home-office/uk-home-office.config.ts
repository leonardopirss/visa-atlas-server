import { MetricType, VisaPurposeCode } from '@prisma/client';

export const UK_HOME_OFFICE_PAGE_URL =
  'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables';
export const UK_HOME_OFFICE_DATASET_ID = 'uk-home-office-occ-d02';
export const UK_HOME_OFFICE_DATASET_CODE = 'Occ_D02';
export const UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID = 'uk-home-office';
export const UK_HOME_OFFICE_METHODOLOGY_URL =
  'https://www.gov.uk/government/publications/user-guide-to-home-office-immigration-statistics--9/user-guide-to-immigration-statistics';
export const UK_HOME_OFFICE_SCHEMA_VERSION = 'occ-d02-soc2020-v1';
export const UK_HOME_OFFICE_WORKSHEET = 'Data_Occ_D02';
export const UK_HOME_OFFICE_HEADERS = [
  'Year',
  'Quarter',
  'Nationality',
  'Region',
  'Visa type',
  'Visa type subgroup',
  'Industry',
  'Occ. major group',
  'Occ. sub-major group',
  'Occ. minor group',
  'Occ. unit group',
  'Grants',
] as const;
export const UK_HOME_OFFICE_VISA_TYPES = ['Worker', 'Temporary Worker'] as const;

export const UK_HOME_OFFICE_CONFIG = {
  destinationIso3: 'GBR',
  citizenshipIso3: 'BRA',
  nationalityLabel: 'Brazil',
  metricType: MetricType.WORK_VISAS_ISSUED,
  purpose: VisaPurposeCode.WORK,
  unit: 'VISAS',
  methodologyVersion: UK_HOME_OFFICE_SCHEMA_VERSION,
  acceptedVisaTypes: UK_HOME_OFFICE_VISA_TYPES,
} as const;
