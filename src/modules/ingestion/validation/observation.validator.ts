import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

const VALUE_STATUSES = new Set<DataStatus>([
  DataStatus.AVAILABLE,
  DataStatus.ESTIMATED,
  DataStatus.REVISED,
]);

@Injectable()
export class ObservationValidator {
  validate(observations: readonly StagedObservation[]): void {
    if (observations.length === 0) throw new IngestionValidationError('EMPTY_RELEASE');
    for (const observation of observations) this.validateOne(observation);
  }

  private validateOne(observation: StagedObservation): void {
    if (observation.purpose !== VisaPurposeCode.WORK) {
      throw new IngestionValidationError('PURPOSE_INVALID');
    }
    if (observation.citizenshipIso3 !== 'BRA') {
      throw new IngestionValidationError('CITIZENSHIP_OUT_OF_SCOPE');
    }
    if (!/^\d{4}$/.test(observation.period)) {
      throw new IngestionValidationError('PERIOD_INVALID');
    }
    this.validateMetricScope(observation);
    if (!observation.sourceCategoryCode.trim()) {
      throw new IngestionValidationError('SOURCE_CATEGORY_MISSING');
    }
    if (observation.value !== null && observation.value < 0n) {
      throw new IngestionValidationError('VALUE_NEGATIVE');
    }
    if (VALUE_STATUSES.has(observation.dataStatus) !== (observation.value !== null)) {
      throw new IngestionValidationError('VALUE_STATUS_MISMATCH');
    }
  }

  private validateMetricScope(observation: StagedObservation): void {
    if (observation.metricType === MetricType.FIRST_RESIDENCE_PERMITS_GRANTED) {
      if (observation.unit !== 'PER') {
        throw new IngestionValidationError('UNIT_INVALID');
      }
      return;
    }
    if (observation.metricType === MetricType.WORK_VISAS_ISSUED) {
      if (observation.destinationIso3 !== 'GBR' || observation.unit !== 'VISAS') {
        throw new IngestionValidationError('UK_HOME_OFFICE_DIMENSIONS_INVALID');
      }
      return;
    }
    throw new IngestionValidationError('METRIC_NOT_ALLOWED_FOR_INGESTION');
  }
}
