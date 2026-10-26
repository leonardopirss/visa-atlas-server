import type { StagedObservation } from '../eurostat/eurostat.types.js';

export type IrccCanadaCell = string | number | null;
export type IrccCanadaRow = readonly IrccCanadaCell[];
export type IrccCanadaObservation = StagedObservation;

export interface IrccCanadaReleasePayload {
  rawPayload: string;
  workbook: Buffer;
  fetchedAt: Date;
  sourcePublishedAt: Date | null;
}
