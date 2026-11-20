import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  UK_HOME_OFFICE_METHODOLOGY_URL,
  UK_HOME_OFFICE_PAGE_URL,
  UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
} from '../uk-home-office/uk-home-office.config.js';
import { UkHomeOfficeReferenceDataService } from '../uk-home-office/uk-home-office-reference-data.service.js';
import {
  VISA_DECISION_DATASET_CODE,
  VISA_DECISION_DATASET_ID,
  VISA_DECISION_SCHEMA_VERSION,
} from './visa-decision.config.js';

@Injectable()
export class VisaDecisionReferenceDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ukReferenceData: UkHomeOfficeReferenceDataService,
  ) {}

  async synchronize(): Promise<void> {
    await this.ukReferenceData.synchronize();
    await this.prisma.sourceDataset.upsert({
      where: { id: VISA_DECISION_DATASET_ID },
      create: {
        id: VISA_DECISION_DATASET_ID,
        organizationId: UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
        code: VISA_DECISION_DATASET_CODE,
        url: UK_HOME_OFFICE_PAGE_URL,
        methodologyUrl: UK_HOME_OFFICE_METHODOLOGY_URL,
        schemaVersion: VISA_DECISION_SCHEMA_VERSION,
      },
      update: {
        organizationId: UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
        code: VISA_DECISION_DATASET_CODE,
        url: UK_HOME_OFFICE_PAGE_URL,
        methodologyUrl: UK_HOME_OFFICE_METHODOLOGY_URL,
        schemaVersion: VISA_DECISION_SCHEMA_VERSION,
      },
    });
  }
}
