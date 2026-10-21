import {
  DataStatus,
  MetricType,
  PrismaClient,
  ReleaseStatus,
  SponsorshipRequirement,
  VisaPurposeCode,
} from '@prisma/client';

export const prisma = new PrismaClient();

export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.metricObservation.deleteMany(),
    prisma.ingestionJob.deleteMany(),
    prisma.datasetRelease.deleteMany(),
    prisma.comparisonGroup.deleteMany(),
    prisma.officialLink.deleteMany(),
    prisma.visaProgram.deleteMany(),
    prisma.sourceDataset.deleteMany(),
    prisma.sourceOrganization.deleteMany(),
    prisma.visaPurpose.deleteMany(),
    prisma.citizenship.deleteMany(),
    prisma.country.deleteMany(),
  ]);
}

export async function seedPublishedFixture(): Promise<void> {
  await prisma.country.createMany({
    data: [
      { iso3: 'DEU', iso2: 'DE', namePt: 'Alemanha', region: 'Europa' },
      { iso3: 'ESP', iso2: 'ES', namePt: 'Espanha', region: 'Europa' },
      { iso3: 'FRA', iso2: 'FR', namePt: 'França', region: 'Europa' },
    ],
  });
  await prisma.citizenship.create({ data: { iso3: 'BRA', namePt: 'Brasil' } });
  await prisma.visaPurpose.create({ data: { code: VisaPurposeCode.WORK, label: 'Trabalho' } });
  await prisma.sourceOrganization.create({
    data: {
      id: 'eurostat',
      name: 'Eurostat',
      homepageUrl: 'https://ec.europa.eu/eurostat',
      license: 'Eurostat reuse policy',
    },
  });
  await prisma.sourceDataset.create({
    data: {
      id: 'migr-resfirst',
      organizationId: 'eurostat',
      code: 'migr_resfirst',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/migr_resfirst/default/table',
      methodologyUrl: 'https://ec.europa.eu/eurostat/cache/metadata/en/migr_res_esms.htm',
      schemaVersion: 'test-v1',
    },
  });
  await prisma.comparisonGroup.create({
    data: {
      id: 'test-comparable-2025',
      datasetId: 'migr-resfirst',
      metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
      citizenshipIso3: 'BRA',
      purposeCode: VisaPurposeCode.WORK,
      period: '2025',
      unit: 'PER',
      methodologyVersion: 'synthetic-test-v1',
    },
  });
  await prisma.datasetRelease.create({
    data: {
      id: 'test-release-2025',
      datasetId: 'migr-resfirst',
      sourcePublishedAt: new Date('2026-01-15T00:00:00Z'),
      fetchedAt: new Date('2026-10-19T00:00:00Z'),
      validatedAt: new Date('2026-10-19T00:00:00Z'),
      publishedAt: new Date('2026-10-19T00:00:00Z'),
      checksum: 'synthetic-contract-fixture',
      status: ReleaseStatus.PUBLISHED,
      observations: {
        create: [
          {
            destinationIso3: 'ESP',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.WORK,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EMP',
            sourceCategoryLabel: 'Employment reasons',
            period: '2025',
            unit: 'PER',
            value: 42n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-comparable-2025',
          },
          {
            destinationIso3: 'DEU',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.WORK,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EMP',
            sourceCategoryLabel: 'Employment reasons',
            period: '2025',
            unit: 'PER',
            value: 0n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-comparable-2025',
          },
          {
            destinationIso3: 'FRA',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.WORK,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EMP',
            sourceCategoryLabel: 'Employment reasons',
            period: '2025',
            unit: 'PER',
            value: null,
            dataStatus: DataStatus.SUPPRESSED,
            comparisonGroupId: 'test-comparable-2025',
          },
        ],
      },
    },
  });
  await prisma.visaProgram.createMany({
    data: [
      {
        id: 'verified-program',
        destinationIso3: 'ESP',
        purposeCode: VisaPurposeCode.WORK,
        officialTitle: 'Programa oficial verificado para teste',
        description: 'Conteúdo sintético de teste.',
        sponsorshipRequirement: SponsorshipRequirement.DEPENDS,
        verifiedAt: new Date('2026-10-19T00:00:00Z'),
        officialUrl: 'https://administracion.gob.es/',
      },
      {
        id: 'unverified-program',
        destinationIso3: 'ESP',
        purposeCode: VisaPurposeCode.WORK,
        officialTitle: 'Programa não verificado para teste',
        sponsorshipRequirement: SponsorshipRequirement.UNKNOWN,
      },
    ],
  });
}
