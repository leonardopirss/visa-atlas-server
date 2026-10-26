import { Injectable } from '@nestjs/common';
import { DataStatus } from '@prisma/client';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import { UK_HOME_OFFICE_CONFIG, UK_HOME_OFFICE_HEADERS } from './uk-home-office.config.js';
import type { UkHomeOfficeObservation, UkHomeOfficeRow } from './uk-home-office.types.js';

type Aggregate = {
  visaType: string;
  subgroup: string;
  value: bigint;
  quarters: Set<string>;
};

@Injectable()
export class UkHomeOfficeAdapter {
  parse(rows: readonly UkHomeOfficeRow[]): UkHomeOfficeObservation[] {
    const headerIndex = rows.findIndex((row) =>
      UK_HOME_OFFICE_HEADERS.every((header, index) => row[index] === header),
    );
    if (headerIndex < 0) {
      throw new IngestionValidationError('UK_HOME_OFFICE_HEADERS_INVALID');
    }

    const aggregates = new Map<string, Aggregate>();
    let brazilRows = 0;
    for (const row of rows.slice(headerIndex + 1)) {
      const nationality = this.string(row[2]);
      if (nationality !== UK_HOME_OFFICE_CONFIG.nationalityLabel) continue;
      brazilRows += 1;
      const year = this.year(row[0]);
      const quarter = this.string(row[1]);
      if (!new RegExp(`^${year} Q[1-4]$`).test(quarter)) {
        throw new IngestionValidationError(`UK_HOME_OFFICE_QUARTER_INVALID:${quarter}`);
      }
      const visaType = this.string(row[4]);
      if (!UK_HOME_OFFICE_CONFIG.acceptedVisaTypes.some((value) => value === visaType)) {
        throw new IngestionValidationError(`UK_HOME_OFFICE_VISA_TYPE_UNKNOWN:${visaType}`);
      }
      const subgroup = this.string(row[5]);
      if (!subgroup) {
        throw new IngestionValidationError('UK_HOME_OFFICE_SUBGROUP_MISSING');
      }
      const grants = this.nonNegativeInteger(row[11]);
      const key = `${year}|${visaType}|${subgroup}`;
      const aggregate = aggregates.get(key) ?? {
        visaType,
        subgroup,
        value: 0n,
        quarters: new Set<string>(),
      };
      aggregate.value += BigInt(grants);
      aggregate.quarters.add(quarter);
      aggregates.set(key, aggregate);
    }
    if (brazilRows === 0) {
      throw new IngestionValidationError('UK_HOME_OFFICE_BRAZIL_MISSING');
    }

    const completeYears = new Set(
      [...aggregates.keys()]
        .map((key) => key.slice(0, 4))
        .filter((year) =>
          [1, 2, 3, 4].every((quarter) =>
            [...aggregates.values()].some((aggregate) =>
              aggregate.quarters.has(`${year} Q${quarter}`),
            ),
          ),
        ),
    );
    const observations = [...aggregates.entries()]
      .filter(([key]) => completeYears.has(key.slice(0, 4)))
      .map(([key, aggregate]) => ({
        destinationIso3: UK_HOME_OFFICE_CONFIG.destinationIso3,
        citizenshipIso3: UK_HOME_OFFICE_CONFIG.citizenshipIso3,
        purpose: UK_HOME_OFFICE_CONFIG.purpose,
        metricType: UK_HOME_OFFICE_CONFIG.metricType,
        sourceCategoryCode: `${aggregate.visaType}:${aggregate.subgroup}`,
        sourceCategoryLabel: `${aggregate.visaType} — ${aggregate.subgroup}`,
        period: key.slice(0, 4),
        unit: UK_HOME_OFFICE_CONFIG.unit,
        value: aggregate.value,
        dataStatus: DataStatus.AVAILABLE,
        methodologyVersion: UK_HOME_OFFICE_CONFIG.methodologyVersion,
      }));
    if (observations.length === 0) {
      throw new IngestionValidationError('UK_HOME_OFFICE_COMPLETE_YEAR_MISSING');
    }
    return observations.sort(
      (left, right) =>
        left.period.localeCompare(right.period) ||
        left.sourceCategoryCode.localeCompare(right.sourceCategoryCode),
    );
  }

  private string(value: UkHomeOfficeRow[number] | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private year(value: UkHomeOfficeRow[number] | undefined): number {
    const year = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new IngestionValidationError(`UK_HOME_OFFICE_YEAR_INVALID:${String(value)}`);
    }
    return year;
  }

  private nonNegativeInteger(value: UkHomeOfficeRow[number] | undefined): number {
    const grants = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(grants) || grants < 0) {
      throw new IngestionValidationError(`UK_HOME_OFFICE_GRANTS_INVALID:${String(value)}`);
    }
    return grants;
  }
}
