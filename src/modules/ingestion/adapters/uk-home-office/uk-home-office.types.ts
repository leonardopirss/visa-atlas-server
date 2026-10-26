import type { StagedObservation } from '../eurostat/eurostat.types.js';

export type UkHomeOfficeCell = string | number | null;
export type UkHomeOfficeRow = readonly UkHomeOfficeCell[];

export interface UkHomeOfficeReleasePayload {
  rawPayload: string;
  workbook: Buffer;
  sourceUrl: string;
  fetchedAt: Date;
  sourcePublishedAt: Date | null;
}

export type UkHomeOfficeObservation = StagedObservation;
