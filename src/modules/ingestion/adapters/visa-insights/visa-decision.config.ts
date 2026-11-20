import { MetricType, VisaPurposeCode } from '@prisma/client';

export const VISA_DECISION_DATASET_ID = 'uk-home-office-vis-d02';
export const VISA_DECISION_DATASET_CODE = 'Vis_D02';
export const VISA_DECISION_WORKSHEET = 'Data_Vis_D02';
export const VISA_DECISION_SCHEMA_VERSION = 'vis-d02-bra-reviewed-v1';

export const VISA_DECISION_HEADER_ALIASES = {
  year: ['Year'],
  quarter: ['Quarter'],
  nationality: ['Nationality'],
  visaType: ['Visa type', 'Visa category'],
  visaSubtype: ['Visa type subgroup', 'Visa type sub-group', 'Visa route'],
  outcome: ['Outcome', 'Decision outcome'],
  value: ['Decisions', 'Outcomes', 'Entry clearance visa outcomes'],
} as const;

export const VISA_DECISION_OUTCOMES = {
  issued: MetricType.DECISIONS_GRANTED,
  refused: MetricType.DECISIONS_REFUSED,
  withdrawn: MetricType.DECISIONS_WITHDRAWN,
  lapsed: MetricType.DECISIONS_LAPSED,
} as const;

export const VISA_DECISION_PURPOSE_RULES = [
  {
    purpose: VisaPurposeCode.WORK,
    visaTypes: ['Worker', 'Temporary Worker'],
    programKey: 'uk-entry-clearance:work',
  },
  {
    purpose: VisaPurposeCode.STUDY,
    visaTypes: ['Study'],
    programKey: 'uk-entry-clearance:study',
  },
] as const;

export const VISA_DECISION_CONFIG = {
  destinationIso3: 'GBR',
  citizenshipIso3: 'BRA',
  nationalityLabel: 'Brazil',
  populationKey: 'BRA',
  unit: 'COUNT',
  methodologyVersion: VISA_DECISION_SCHEMA_VERSION,
} as const;
