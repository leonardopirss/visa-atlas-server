import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, PopulationBasis, VisaPurposeCode } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { DecisionInsightValidator } from './decision-insight.validator.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

const VALUE_STATUSES = new Set<DataStatus>([
  DataStatus.AVAILABLE,
  DataStatus.ESTIMATED,
  DataStatus.REVISED,
]);

@Injectable()
export class ObservationValidator {
  constructor(
    private readonly decisionInsightValidator: DecisionInsightValidator = new DecisionInsightValidator(),
  ) {}

  validate(observations: readonly StagedObservation[]): void {
    if (observations.length === 0) throw new IngestionValidationError('EMPTY_RELEASE');
    for (const observation of observations) this.validateOne(observation);
  }

  private validateOne(observation: StagedObservation): void {
    if (!Object.values(VisaPurposeCode).includes(observation.purpose)) {
      throw new IngestionValidationError('PURPOSE_INVALID');
    }
    this.validatePopulationScope(observation);
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

  private validatePopulationScope(observation: StagedObservation): void {
    const basis = observation.populationBasis ?? PopulationBasis.CITIZENSHIP;
    const populationKey =
      observation.populationKey ??
      (basis === PopulationBasis.NATIONAL ? 'ALL' : observation.citizenshipIso3);
    const programKey = observation.programKey ?? 'ALL';
    if (
      basis === PopulationBasis.CITIZENSHIP &&
      (observation.citizenshipIso3 !== 'BRA' || populationKey !== 'BRA')
    ) {
      throw new IngestionValidationError('CITIZENSHIP_OUT_OF_SCOPE');
    }
    if (
      basis === PopulationBasis.NATIONAL &&
      (observation.citizenshipIso3 !== null || populationKey !== 'ALL')
    ) {
      throw new IngestionValidationError('POPULATION_SCOPE_INVALID');
    }
    if (
      programKey !== 'ALL' &&
      !/^[a-z0-9]+(-[a-z0-9]+)*(:[a-z0-9]+(-[a-z0-9]+)*)+$/.test(programKey)
    ) {
      throw new IngestionValidationError('PROGRAM_KEY_INVALID');
    }
  }

  private validateMetricScope(observation: StagedObservation): void {
    if (
      observation.metricType === MetricType.DECISIONS_GRANTED ||
      observation.metricType === MetricType.DECISIONS_REFUSED ||
      observation.metricType === MetricType.DECISIONS_WITHDRAWN ||
      observation.metricType === MetricType.DECISIONS_LAPSED
    ) {
      this.decisionInsightValidator.validate([observation]);
      return;
    }
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
    if (observation.metricType === MetricType.APPLICATIONS_RECEIVED) {
      if (
        observation.destinationIso3 !== 'GBR' ||
        observation.purpose !== VisaPurposeCode.STUDY ||
        observation.unit !== 'APPLICATIONS'
      ) {
        throw new IngestionValidationError('UK_HOME_OFFICE_STUDY_DIMENSIONS_INVALID');
      }
      return;
    }
    if (observation.metricType === MetricType.VALID_PERMIT_HOLDERS) {
      if (observation.destinationIso3 !== 'CAN' || observation.unit !== 'HOLDERS') {
        throw new IngestionValidationError('IRCC_CANADA_DIMENSIONS_INVALID');
      }
      return;
    }
    throw new IngestionValidationError('METRIC_NOT_ALLOWED_FOR_INGESTION');
  }
}
