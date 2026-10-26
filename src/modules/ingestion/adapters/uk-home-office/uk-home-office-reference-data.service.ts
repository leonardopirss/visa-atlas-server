import { Injectable } from '@nestjs/common';
import { VisaPurposeCode } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  UK_HOME_OFFICE_DATASET_CODE,
  UK_HOME_OFFICE_DATASET_ID,
  UK_HOME_OFFICE_METHODOLOGY_URL,
  UK_HOME_OFFICE_PAGE_URL,
  UK_HOME_OFFICE_SCHEMA_VERSION,
  UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
} from './uk-home-office.config.js';

@Injectable()
export class UkHomeOfficeReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  async synchronize(): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.citizenship.upsert({
        where: { iso3: 'BRA' },
        create: { iso3: 'BRA', namePt: 'Brasil' },
        update: { namePt: 'Brasil' },
      });
      await transaction.visaPurpose.upsert({
        where: { code: VisaPurposeCode.WORK },
        create: { code: VisaPurposeCode.WORK, label: 'Trabalho' },
        update: { label: 'Trabalho' },
      });
      await transaction.sourceOrganization.upsert({
        where: { id: UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID },
        create: {
          id: UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
          name: 'UK Home Office',
          homepageUrl: 'https://www.gov.uk/government/organisations/home-office',
          license: 'Open Government Licence v3.0',
        },
        update: {
          name: 'UK Home Office',
          homepageUrl: 'https://www.gov.uk/government/organisations/home-office',
          license: 'Open Government Licence v3.0',
        },
      });
      await transaction.sourceDataset.upsert({
        where: { id: UK_HOME_OFFICE_DATASET_ID },
        create: {
          id: UK_HOME_OFFICE_DATASET_ID,
          organizationId: UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
          code: UK_HOME_OFFICE_DATASET_CODE,
          url: UK_HOME_OFFICE_PAGE_URL,
          methodologyUrl: UK_HOME_OFFICE_METHODOLOGY_URL,
          schemaVersion: UK_HOME_OFFICE_SCHEMA_VERSION,
        },
        update: {
          organizationId: UK_HOME_OFFICE_SOURCE_ORGANIZATION_ID,
          code: UK_HOME_OFFICE_DATASET_CODE,
          url: UK_HOME_OFFICE_PAGE_URL,
          methodologyUrl: UK_HOME_OFFICE_METHODOLOGY_URL,
          schemaVersion: UK_HOME_OFFICE_SCHEMA_VERSION,
        },
      });
    });
  }
}
