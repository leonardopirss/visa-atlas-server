import { Injectable } from '@nestjs/common';
import { VisaPurposeCode } from '@prisma/client';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import {
  EUROSTAT_DATASET_CODE,
  EUROSTAT_DATASET_ID,
  EUROSTAT_DATASET_URL,
  EUROSTAT_DESTINATIONS,
  EUROSTAT_METHODOLOGY_URL,
  EUROSTAT_SOURCE_ORGANIZATION_ID,
} from './eurostat.config.js';

@Injectable()
export class EurostatReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}

  async synchronize(): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      for (const [iso2, country] of Object.entries(EUROSTAT_DESTINATIONS)) {
        await transaction.country.upsert({
          where: { iso3: country.iso3 },
          create: {
            iso3: country.iso3,
            iso2,
            namePt: country.namePt,
            region: 'Europa',
          },
          update: { iso2, namePt: country.namePt, region: 'Europa' },
        });
      }
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
        where: { id: EUROSTAT_SOURCE_ORGANIZATION_ID },
        create: {
          id: EUROSTAT_SOURCE_ORGANIZATION_ID,
          name: 'Eurostat',
          homepageUrl: 'https://ec.europa.eu/eurostat',
          license: 'European Commission reuse policy (Decision 2011/833/EU)',
        },
        update: {
          name: 'Eurostat',
          homepageUrl: 'https://ec.europa.eu/eurostat',
          license: 'European Commission reuse policy (Decision 2011/833/EU)',
        },
      });
      await transaction.sourceDataset.upsert({
        where: { id: EUROSTAT_DATASET_ID },
        create: {
          id: EUROSTAT_DATASET_ID,
          organizationId: EUROSTAT_SOURCE_ORGANIZATION_ID,
          code: EUROSTAT_DATASET_CODE,
          url: EUROSTAT_DATASET_URL,
          methodologyUrl: EUROSTAT_METHODOLOGY_URL,
          schemaVersion: 'eurostat-jsonstat-2',
        },
        update: {
          organizationId: EUROSTAT_SOURCE_ORGANIZATION_ID,
          code: EUROSTAT_DATASET_CODE,
          url: EUROSTAT_DATASET_URL,
          methodologyUrl: EUROSTAT_METHODOLOGY_URL,
          schemaVersion: 'eurostat-jsonstat-2',
        },
      });
    });
  }
}
