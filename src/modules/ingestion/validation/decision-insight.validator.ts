import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, PopulationBasis } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

const RAW_DECISION_EVENTS = new Set<MetricType>([
  MetricType.DECISIONS_GRANTED,
  MetricType.DECISIONS_REFUSED,
  MetricType.DECISIONS_WITHDRAWN,
  MetricType.DECISIONS_LAPSED,
]);

@Injectable()
export class DecisionInsightValidator {
  validate(observations: readonly StagedObservation[]): void {
    if (observations.length === 0) {
      throw new IngestionValidationError('EMPTY_RELEASE');
    }
    for (const observation of observations) this.validateOne(observation);
  }

  private validateOne(observation: StagedObservation): void {
    if (!RAW_DECISION_EVENTS.has(observation.metricType)) {
      throw new IngestionValidationError('DECISION_EVENT_INVALID');
    }
    if (
      observation.populationBasis !== PopulationBasis.CITIZENSHIP ||
      observation.populationKey !== 'BRA' ||
      observation.citizenshipIso3 !== 'BRA'
    ) {
      throw new IngestionValidationError('DECISION_POPULATION_INVALID');
    }
    if (observation.unit !== 'COUNT') {
      throw new IngestionValidationError('DECISION_UNIT_INVALID');
    }
    if (!/^\d{4}$/.test(observation.period)) {
      throw new IngestionValidationError('DECISION_PERIOD_INVALID');
    }
    if (
      (observation.dataStatus !== DataStatus.AVAILABLE &&
        observation.dataStatus !== DataStatus.REVISED) ||
      observation.value === null ||
      observation.value < 0n
    ) {
      throw new IngestionValidationError('DECISION_STATUS_INVALID');
    }
    if (!/^[^:]+:[^:]+$/.test(observation.sourceCategoryCode.trim())) {
      throw new IngestionValidationError('DECISION_SOURCE_CATEGORY_INVALID');
    }
  }
}
