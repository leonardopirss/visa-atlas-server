import type { StagedObservation } from '../eurostat/eurostat.types.js';
import type { UkHomeOfficeRow } from '../uk-home-office/uk-home-office.types.js';

export type VisaDecisionRow = UkHomeOfficeRow;
export type VisaDecisionObservation = StagedObservation;

export interface VisaDecisionReleasePayload {
  rawPayload: string;
  workbook: Buffer;
  sourceUrl: string;
  fetchedAt: Date;
  sourcePublishedAt: Date | null;
}
