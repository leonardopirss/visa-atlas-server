import { Injectable } from '@nestjs/common';
import { DataStatus, PopulationBasis, type MetricType } from '@prisma/client';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import {
  VISA_DECISION_CONFIG,
  VISA_DECISION_HEADER_ALIASES,
  VISA_DECISION_OUTCOMES,
  VISA_DECISION_PURPOSE_RULES,
} from './visa-decision.config.js';
import type { VisaDecisionObservation, VisaDecisionRow } from './visa-decision.types.js';

type ColumnKey = keyof typeof VISA_DECISION_HEADER_ALIASES;
type ColumnIndexes = Record<ColumnKey, number>;

interface Aggregate {
  visaType: string;
  visaSubtype: string;
  outcomeLabel: string;
  metricType: MetricType;
  purpose: (typeof VISA_DECISION_PURPOSE_RULES)[number]['purpose'];
  programKey: string;
  year: number;
  value: bigint;
  quarters: Set<string>;
}

@Injectable()
export class VisaDecisionAdapter {
  parse(rows: readonly VisaDecisionRow[]): VisaDecisionObservation[] {
    const header = this.findHeader(rows);
    const aggregates = new Map<string, Aggregate>();
    const rowKeys = new Set<string>();
    let admittedRows = 0;

    for (const row of rows.slice(header.rowIndex + 1)) {
      if (this.string(row[header.columns.nationality]) !== VISA_DECISION_CONFIG.nationalityLabel) {
        continue;
      }
      const visaType = this.string(row[header.columns.visaType]);
      const purposeRule = VISA_DECISION_PURPOSE_RULES.find(({ visaTypes }) =>
        visaTypes.some((candidate) => candidate === visaType),
      );
      if (!purposeRule) continue;

      admittedRows += 1;
      const year = this.year(row[header.columns.year]);
      const quarter = this.string(row[header.columns.quarter]);
      if (!new RegExp(`^${year} Q[1-4]$`).test(quarter)) {
        throw new IngestionValidationError(`VISA_DECISION_QUARTER_INVALID:${quarter}`);
      }
      const visaSubtype = this.string(row[header.columns.visaSubtype]);
      if (!visaSubtype) throw new IngestionValidationError('VISA_DECISION_SUBTYPE_MISSING');
      const outcomeLabel = this.string(row[header.columns.outcome]);
      const metricType = this.outcomeMetric(outcomeLabel);
      const rowKey = [year, quarter, visaType, visaSubtype, outcomeLabel.toLowerCase()].join('|');
      if (rowKeys.has(rowKey)) {
        throw new IngestionValidationError(`VISA_DECISION_DUPLICATE_ROW:${rowKey}`);
      }
      rowKeys.add(rowKey);

      const aggregateKey = [year, visaType, visaSubtype, outcomeLabel.toLowerCase()].join('|');
      const aggregate = aggregates.get(aggregateKey) ?? {
        visaType,
        visaSubtype,
        outcomeLabel,
        metricType,
        purpose: purposeRule.purpose,
        programKey: purposeRule.programKey,
        year,
        value: 0n,
        quarters: new Set<string>(),
      };
      aggregate.value += this.nonNegativeInteger(row[header.columns.value]);
      aggregate.quarters.add(quarter);
      aggregates.set(aggregateKey, aggregate);
    }

    if (admittedRows === 0) {
      throw new IngestionValidationError('VISA_DECISION_BRAZIL_REVIEWED_SCOPE_MISSING');
    }
    this.assertCompleteAnnualOutcomeSets(aggregates);

    return [...aggregates.values()]
      .map((aggregate) => ({
        destinationIso3: VISA_DECISION_CONFIG.destinationIso3,
        citizenshipIso3: VISA_DECISION_CONFIG.citizenshipIso3,
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: VISA_DECISION_CONFIG.populationKey,
        programKey: aggregate.programKey,
        purpose: aggregate.purpose,
        metricType: aggregate.metricType,
        sourceCategoryCode: `${aggregate.visaType}:${aggregate.visaSubtype}`,
        sourceCategoryLabel: `${aggregate.visaType} — ${aggregate.visaSubtype} · ${aggregate.outcomeLabel}`,
        period: String(aggregate.year),
        unit: VISA_DECISION_CONFIG.unit,
        value: aggregate.value,
        dataStatus: DataStatus.AVAILABLE,
        methodologyVersion: VISA_DECISION_CONFIG.methodologyVersion,
      }))
      .sort(
        (left, right) =>
          left.period.localeCompare(right.period) ||
          left.sourceCategoryCode.localeCompare(right.sourceCategoryCode) ||
          left.metricType.localeCompare(right.metricType),
      );
  }

  private findHeader(rows: readonly VisaDecisionRow[]): {
    rowIndex: number;
    columns: ColumnIndexes;
  } {
    for (const [rowIndex, row] of rows.entries()) {
      const values = row.map((value) => this.string(value));
      const entries = Object.entries(VISA_DECISION_HEADER_ALIASES).map(([key, aliases]) => {
        const index = values.findIndex((value) =>
          aliases.some((alias) => alias.toLowerCase() === value.toLowerCase()),
        );
        return [key, index] as const;
      });
      if (entries.every(([, index]) => index >= 0)) {
        return { rowIndex, columns: Object.fromEntries(entries) as ColumnIndexes };
      }
    }
    throw new IngestionValidationError('VISA_DECISION_HEADERS_INVALID');
  }

  private outcomeMetric(label: string): MetricType {
    const metricType =
      VISA_DECISION_OUTCOMES[label.toLowerCase() as keyof typeof VISA_DECISION_OUTCOMES];
    if (!metricType) {
      throw new IngestionValidationError(`VISA_DECISION_OUTCOME_UNKNOWN:${label}`);
    }
    return metricType;
  }

  private assertCompleteAnnualOutcomeSets(aggregates: ReadonlyMap<string, Aggregate>): void {
    const expectedMetrics = new Set<MetricType>(Object.values(VISA_DECISION_OUTCOMES));
    const categories = new Map<string, Aggregate[]>();
    for (const aggregate of aggregates.values()) {
      const key = [aggregate.year, aggregate.visaType, aggregate.visaSubtype].join('|');
      const values = categories.get(key) ?? [];
      values.push(aggregate);
      categories.set(key, values);
    }
    for (const [key, values] of categories) {
      if (
        values.some(({ quarters }) => quarters.size !== 4) ||
        [...expectedMetrics].some(
          (metricType) => !values.some((aggregate) => aggregate.metricType === metricType),
        )
      ) {
        throw new IngestionValidationError(`VISA_DECISION_COMPLETE_YEAR_MISSING:${key}`);
      }
    }
  }

  private string(value: VisaDecisionRow[number] | undefined): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private year(value: VisaDecisionRow[number] | undefined): number {
    const year = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new IngestionValidationError(`VISA_DECISION_YEAR_INVALID:${String(value)}`);
    }
    return year;
  }

  private nonNegativeInteger(value: VisaDecisionRow[number] | undefined): bigint {
    const count = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new IngestionValidationError(`VISA_DECISION_COUNT_INVALID:${String(value)}`);
    }
    return BigInt(count);
  }
}
