import { Injectable } from '@nestjs/common';
import { DataStatus } from '@prisma/client';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import { IRCC_CANADA_CONFIG } from './ircc-canada.config.js';
import type { IrccCanadaObservation, IrccCanadaRow } from './ircc-canada.types.js';

@Injectable()
export class IrccCanadaAdapter {
  parse(rows: readonly IrccCanadaRow[]): IrccCanadaObservation[] {
    const title = this.string(rows[0]?.[0]);
    if (!title.includes('International Mobility Program') || !title.includes('December 31st')) {
      throw new IngestionValidationError('IRCC_CANADA_TITLE_INVALID');
    }
    const header = rows.find((row) => this.string(row[0]) === 'Country of Citizenship');
    if (!header) throw new IngestionValidationError('IRCC_CANADA_HEADERS_INVALID');
    const brazil = rows.find((row) => this.string(row[0]) === IRCC_CANADA_CONFIG.citizenshipLabel);
    if (!brazil) throw new IngestionValidationError('IRCC_CANADA_BRAZIL_MISSING');

    return header.slice(1).map((yearCell, offset) => {
      const period = this.year(yearCell);
      const rawValue = this.string(brazil[offset + 1]);
      const suppressed = rawValue === '--';
      return {
        destinationIso3: IRCC_CANADA_CONFIG.destinationIso3,
        citizenshipIso3: IRCC_CANADA_CONFIG.citizenshipIso3,
        purpose: IRCC_CANADA_CONFIG.purpose,
        metricType: IRCC_CANADA_CONFIG.metricType,
        sourceCategoryCode: IRCC_CANADA_CONFIG.sourceCategoryCode,
        sourceCategoryLabel: IRCC_CANADA_CONFIG.sourceCategoryLabel,
        period,
        unit: IRCC_CANADA_CONFIG.unit,
        value: suppressed ? null : this.value(rawValue),
        dataStatus: suppressed ? DataStatus.SUPPRESSED : DataStatus.AVAILABLE,
        methodologyVersion: IRCC_CANADA_CONFIG.methodologyVersion,
      };
    });
  }

  private string(value: IrccCanadaRow[number] | undefined): string {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  private year(value: IrccCanadaRow[number] | undefined): string {
    const year = this.string(value);
    if (!/^\d{4}$/.test(year))
      throw new IngestionValidationError(`IRCC_CANADA_YEAR_INVALID:${year}`);
    return year;
  }

  private value(value: string): bigint {
    const normalized = value.replaceAll(',', '');
    if (!/^\d+$/.test(normalized)) {
      throw new IngestionValidationError(`IRCC_CANADA_VALUE_INVALID:${value}`);
    }
    return BigInt(normalized);
  }
}
