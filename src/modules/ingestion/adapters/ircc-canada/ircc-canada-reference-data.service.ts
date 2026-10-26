import { Injectable } from '@nestjs/common';
import { VisaPurposeCode } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  IRCC_CANADA_DATASET_CODE,
  IRCC_CANADA_DATASET_ID,
  IRCC_CANADA_DATASET_PAGE_URL,
  IRCC_CANADA_SCHEMA_VERSION,
  IRCC_CANADA_SOURCE_ORGANIZATION_ID,
} from './ircc-canada.config.js';

@Injectable()
export class IrccCanadaReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  async synchronize(): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.country.upsert({
        where: { iso3: 'CAN' },
        create: { iso3: 'CAN', iso2: 'CA', namePt: 'Canadá', region: 'Américas' },
        update: { iso2: 'CA', namePt: 'Canadá', region: 'Américas' },
      });
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
        where: { id: IRCC_CANADA_SOURCE_ORGANIZATION_ID },
        create: {
          id: IRCC_CANADA_SOURCE_ORGANIZATION_ID,
          name: 'Immigration, Refugees and Citizenship Canada (IRCC)',
          homepageUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
          license: 'Open Government Licence — Canada 2.0',
        },
        update: {
          name: 'Immigration, Refugees and Citizenship Canada (IRCC)',
          homepageUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
          license: 'Open Government Licence — Canada 2.0',
        },
      });
      await transaction.sourceDataset.upsert({
        where: { id: IRCC_CANADA_DATASET_ID },
        create: {
          id: IRCC_CANADA_DATASET_ID,
          organizationId: IRCC_CANADA_SOURCE_ORGANIZATION_ID,
          code: IRCC_CANADA_DATASET_CODE,
          url: IRCC_CANADA_DATASET_PAGE_URL,
          methodologyUrl: IRCC_CANADA_DATASET_PAGE_URL,
          schemaVersion: IRCC_CANADA_SCHEMA_VERSION,
        },
        update: {
          organizationId: IRCC_CANADA_SOURCE_ORGANIZATION_ID,
          code: IRCC_CANADA_DATASET_CODE,
          url: IRCC_CANADA_DATASET_PAGE_URL,
          methodologyUrl: IRCC_CANADA_DATASET_PAGE_URL,
          schemaVersion: IRCC_CANADA_SCHEMA_VERSION,
        },
      });
    });
  }
}
