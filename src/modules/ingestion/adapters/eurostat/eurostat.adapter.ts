import { Injectable } from '@nestjs/common';
import { DataStatus } from '@prisma/client';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import type {
  EurostatAdapterConfig,
  EurostatDimensionCategory,
  EurostatPayload,
  StagedObservation,
} from './eurostat.types.js';

@Injectable()
export class EurostatAdapter {
  parse(payload: EurostatPayload, config: EurostatAdapterConfig): StagedObservation[] {
    this.assertShape(payload, config);
    const codesByDimension = payload.id.map((id) =>
      this.orderedCodes(payload.dimension[id]?.category),
    );
    const observations: StagedObservation[] = [];
    const totalCells = payload.size.reduce((total, size) => total * size, 1);

    for (let flatIndex = 0; flatIndex < totalCells; flatIndex += 1) {
      const coordinates = this.coordinates(flatIndex, payload.size);
      const dimensions = Object.fromEntries(
        payload.id.map((id, position) => [
          id,
          codesByDimension[position]?.[coordinates[position] ?? 0],
        ]),
      );
      const sourceCategoryCode = dimensions[config.purposeDimension];
      if (!sourceCategoryCode || !config.workCategoryCodes.includes(sourceCategoryCode)) continue;
      const destination = dimensions[config.destinationDimension];
      const citizenship = dimensions[config.citizenshipDimension];
      const period = dimensions[config.periodDimension];
      const unit = dimensions[config.unitDimension];
      if (!destination || !citizenship || !period || !unit) {
        throw new IngestionValidationError('EUROSTAT_DIMENSION_VALUE_MISSING');
      }
      if (!config.countUnitCodes.includes(unit)) {
        throw new IngestionValidationError(`EUROSTAT_UNIT_UNEXPECTED:${unit}`);
      }
      const destinationIso3 = config.destinationIso2ToIso3[destination];
      const citizenshipIso3 = config.citizenshipIso2ToIso3[citizenship];
      if (!destinationIso3 || !citizenshipIso3) continue;

      const rawValue = this.cell(payload.value, flatIndex);
      const statusFlag = this.cell(payload.status, flatIndex);
      if (rawValue !== null && rawValue !== undefined && !Number.isSafeInteger(rawValue)) {
        throw new IngestionValidationError('EUROSTAT_VALUE_NOT_SAFE_INTEGER');
      }
      observations.push({
        destinationIso3,
        citizenshipIso3,
        purpose: config.purpose,
        metricType: config.metricType,
        sourceCategoryCode,
        sourceCategoryLabel:
          payload.dimension[config.purposeDimension]?.category.label?.[sourceCategoryCode] ?? null,
        period,
        unit,
        value: rawValue === null || rawValue === undefined ? null : BigInt(rawValue),
        dataStatus: this.mapStatus(rawValue, statusFlag),
        methodologyVersion: 'eurostat-jsonstat-2',
      });
    }
    return observations;
  }

  private assertShape(payload: EurostatPayload, config: EurostatAdapterConfig): void {
    if (
      payload.id.length !== payload.size.length ||
      payload.id.some((id) => !payload.dimension[id])
    ) {
      throw new IngestionValidationError('EUROSTAT_SHAPE_INVALID');
    }
    for (const dimension of [
      config.destinationDimension,
      config.citizenshipDimension,
      config.purposeDimension,
      config.periodDimension,
      config.unitDimension,
    ]) {
      if (!payload.id.includes(dimension)) {
        throw new IngestionValidationError(`EUROSTAT_DIMENSION_MISSING:${dimension}`);
      }
    }
  }

  private orderedCodes(category: EurostatDimensionCategory | undefined): string[] {
    if (!category) throw new IngestionValidationError('EUROSTAT_CATEGORY_MISSING');
    if (Array.isArray(category.index)) return category.index;
    return Object.entries(category.index)
      .sort(([, left], [, right]) => left - right)
      .map(([code]) => code);
  }

  private coordinates(index: number, sizes: number[]): number[] {
    let remainder = index;
    const result = Array<number>(sizes.length).fill(0);
    for (let position = sizes.length - 1; position >= 0; position -= 1) {
      const size = sizes[position];
      if (size === undefined || size <= 0)
        throw new IngestionValidationError('EUROSTAT_SIZE_INVALID');
      result[position] = remainder % size;
      remainder = Math.floor(remainder / size);
    }
    return result;
  }

  private cell<T>(
    values: Record<string, T> | T[] | null | undefined,
    index: number,
  ): T | undefined {
    return Array.isArray(values) ? values[index] : values?.[String(index)];
  }

  private mapStatus(value: number | null | undefined, flag: string | undefined): DataStatus {
    if (value === null || value === undefined) {
      return flag?.includes('c') || flag?.includes(':')
        ? DataStatus.SUPPRESSED
        : DataStatus.UNAVAILABLE;
    }
    if (flag?.includes('e')) return DataStatus.ESTIMATED;
    if (flag?.includes('r')) return DataStatus.REVISED;
    return DataStatus.AVAILABLE;
  }
}
