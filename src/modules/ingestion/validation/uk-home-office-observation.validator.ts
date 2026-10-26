import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { UK_HOME_OFFICE_SCHEMA_VERSION } from '../adapters/uk-home-office/uk-home-office.config.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

@Injectable()
export class UkHomeOfficeObservationValidator {
  validate(observations: readonly StagedObservation[]): void {
    if (observations.length === 0) throw new IngestionValidationError('EMPTY_RELEASE');
    for (const observation of observations) {
      if (
        observation.metricType !== MetricType.WORK_VISAS_ISSUED ||
        observation.purpose !== VisaPurposeCode.WORK ||
        observation.destinationIso3 !== 'GBR' ||
        observation.citizenshipIso3 !== 'BRA' ||
        observation.unit !== 'VISAS' ||
        observation.methodologyVersion !== UK_HOME_OFFICE_SCHEMA_VERSION
      ) {
        throw new IngestionValidationError('UK_HOME_OFFICE_OBSERVATION_SCOPE_INVALID');
      }
      if (!/^(Worker|Temporary Worker):.+/.test(observation.sourceCategoryCode)) {
        throw new IngestionValidationError('UK_HOME_OFFICE_CATEGORY_INVALID');
      }
      if (
        observation.value === null ||
        observation.value < 0n ||
        observation.dataStatus !== DataStatus.AVAILABLE
      ) {
        throw new IngestionValidationError('UK_HOME_OFFICE_VALUE_STATUS_INVALID');
      }
    }
  }
}
