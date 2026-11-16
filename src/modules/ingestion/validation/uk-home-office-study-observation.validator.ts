import { Injectable } from '@nestjs/common';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import type { StagedObservation } from '../adapters/eurostat/eurostat.types.js';
import { UK_HOME_OFFICE_STUDY_SCHEMA_VERSION } from '../adapters/uk-home-office/uk-home-office.config.js';
import { IngestionValidationError } from './ingestion-validation.error.js';

@Injectable()
export class UkHomeOfficeStudyObservationValidator {
  validate(observations: readonly StagedObservation[]): void {
    if (observations.length === 0) throw new IngestionValidationError('EMPTY_RELEASE');
    for (const observation of observations) {
      if (
        observation.metricType !== MetricType.APPLICATIONS_RECEIVED ||
        observation.purpose !== VisaPurposeCode.STUDY ||
        observation.destinationIso3 !== 'GBR' ||
        observation.citizenshipIso3 !== 'BRA' ||
        observation.unit !== 'APPLICATIONS' ||
        observation.methodologyVersion !== UK_HOME_OFFICE_STUDY_SCHEMA_VERSION
      ) {
        throw new IngestionValidationError('UK_HOME_OFFICE_STUDY_OBSERVATION_SCOPE_INVALID');
      }
      if (!/^(Tier 4 - General Student|Student):.+/.test(observation.sourceCategoryCode)) {
        throw new IngestionValidationError('UK_HOME_OFFICE_STUDY_CATEGORY_INVALID');
      }
      if (
        observation.value === null ||
        observation.value < 0n ||
        observation.dataStatus !== DataStatus.AVAILABLE
      ) {
        throw new IngestionValidationError('UK_HOME_OFFICE_STUDY_VALUE_STATUS_INVALID');
      }
    }
  }
}
