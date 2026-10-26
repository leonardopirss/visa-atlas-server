import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { IRCC_CANADA_CONFIG } from '../adapters/ircc-canada/ircc-canada.config.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

@Injectable()
export class IrccCanadaObservationValidator {
  validate(observations: readonly StagedObservation[]): void {
    if (observations.length === 0) throw new IngestionValidationError('EMPTY_RELEASE');
    for (const observation of observations) {
      if (
        observation.metricType !== MetricType.VALID_PERMIT_HOLDERS ||
        observation.purpose !== VisaPurposeCode.WORK ||
        observation.destinationIso3 !== 'CAN' ||
        observation.citizenshipIso3 !== 'BRA' ||
        observation.unit !== 'HOLDERS' ||
        observation.methodologyVersion !== IRCC_CANADA_CONFIG.methodologyVersion
      ) {
        throw new IngestionValidationError('IRCC_CANADA_OBSERVATION_SCOPE_INVALID');
      }
      if (
        observation.sourceCategoryCode !== IRCC_CANADA_CONFIG.sourceCategoryCode ||
        !/^\d{4}$/.test(observation.period)
      ) {
        throw new IngestionValidationError('IRCC_CANADA_CATEGORY_OR_PERIOD_INVALID');
      }
      const available = observation.dataStatus === DataStatus.AVAILABLE;
      const suppressed = observation.dataStatus === DataStatus.SUPPRESSED;
      if (
        (!available && !suppressed) ||
        (available && (observation.value === null || observation.value < 0n)) ||
        (suppressed && observation.value !== null)
      ) {
        throw new IngestionValidationError('IRCC_CANADA_VALUE_STATUS_INVALID');
      }
    }
  }
}
