import {
  DataStatus,
  MetricType,
  PrismaClient,
  ReleaseStatus,
  SponsorshipRequirement,
  VisaPurposeCode,
} from '@prisma/client';

export const prisma = new PrismaClient();

export function assertTestDatabaseUrl(databaseUrl: string | undefined): void {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for database tests');

  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const schema = parsed.searchParams.get('schema') ?? 'public';
  if (!databaseName.toLowerCase().includes('test') && !schema.toLowerCase().includes('test')) {
    throw new Error(
      'Refusing to reset a database whose database name or schema is not marked as test',
    );
  }
}

export async function resetDatabase(): Promise<void> {
  assertTestDatabaseUrl(process.env.DATABASE_URL);
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

export async function seedDestinationComparisonFixture(): Promise<void> {
  await prisma.country.createMany({
    data: [
      { iso3: 'GBR', iso2: 'GB', namePt: 'Reino Unido', region: 'Europa' },
      { iso3: 'CAN', iso2: 'CA', namePt: 'Canadá', region: 'Américas' },
    ],
    skipDuplicates: true,
  });
  await prisma.sourceOrganization.createMany({
    data: [
      {
        id: 'uk-home-office-test',
        name: 'UK Home Office',
        homepageUrl: 'https://www.gov.uk/government/organisations/home-office',
        license: 'Synthetic test fixture',
      },
      {
        id: 'ircc-test',
        name: 'Immigration, Refugees and Citizenship Canada',
        homepageUrl: 'https://www.canada.ca/en/immigration-refugees-citizenship.html',
        license: 'Synthetic test fixture',
      },
    ],
  });
  await prisma.sourceDataset.createMany({
    data: [
      {
        id: 'uk-work-visas-test',
        organizationId: 'uk-home-office-test',
        code: 'Occ_D02_TEST',
        url: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables',
        schemaVersion: 'synthetic-test-v1',
      },
      {
        id: 'canada-imp-test',
        organizationId: 'ircc-test',
        code: 'IMP_CITZ_YEAR_END_WORK_TEST',
        url: 'https://open.canada.ca/data/en/dataset',
        schemaVersion: 'synthetic-test-v1',
      },
    ],
  });
  await prisma.comparisonGroup.createMany({
    data: [
      {
        id: 'uk-work-visas-test-2025',
        datasetId: 'uk-work-visas-test',
        metricType: MetricType.WORK_VISAS_ISSUED,
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.WORK,
        period: '2025',
        unit: 'VISAS',
        methodologyVersion: 'synthetic-test-v1',
      },
      {
        id: 'canada-imp-test-2024',
        datasetId: 'canada-imp-test',
        metricType: MetricType.VALID_PERMIT_HOLDERS,
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.WORK,
        period: '2024',
        unit: 'HOLDERS',
        methodologyVersion: 'synthetic-test-v1',
      },
    ],
  });
  await prisma.datasetRelease.create({
    data: {
      id: 'uk-test-release-2025',
      datasetId: 'uk-work-visas-test',
      sourcePublishedAt: new Date('2026-01-20T00:00:00Z'),
      fetchedAt: new Date('2026-10-19T00:00:00Z'),
      validatedAt: new Date('2026-10-19T00:00:00Z'),
      publishedAt: new Date('2026-10-19T00:00:00Z'),
      checksum: 'synthetic-uk-comparison-fixture',
      status: ReleaseStatus.PUBLISHED,
      observations: {
        create: {
          destinationIso3: 'GBR',
          citizenshipIso3: 'BRA',
          purposeCode: VisaPurposeCode.WORK,
          metricType: MetricType.WORK_VISAS_ISSUED,
          sourceCategoryCode: 'WORK_TEST',
          sourceCategoryLabel: 'Synthetic work visa grants',
          period: '2025',
          unit: 'VISAS',
          value: 84n,
          dataStatus: DataStatus.AVAILABLE,
          comparisonGroupId: 'uk-work-visas-test-2025',
        },
      },
    },
  });
  await prisma.datasetRelease.create({
    data: {
      id: 'canada-test-release-2024',
      datasetId: 'canada-imp-test',
      sourcePublishedAt: new Date('2025-12-31T00:00:00Z'),
      fetchedAt: new Date('2026-10-19T00:00:00Z'),
      validatedAt: new Date('2026-10-19T00:00:00Z'),
      publishedAt: new Date('2026-10-19T00:00:00Z'),
      checksum: 'synthetic-canada-comparison-fixture',
      status: ReleaseStatus.PUBLISHED,
      observations: {
        create: {
          destinationIso3: 'CAN',
          citizenshipIso3: 'BRA',
          purposeCode: VisaPurposeCode.WORK,
          metricType: MetricType.VALID_PERMIT_HOLDERS,
          sourceCategoryCode: 'IMP_TEST',
          sourceCategoryLabel: 'Synthetic IMP holders',
          period: '2024',
          unit: 'HOLDERS',
          value: 156n,
          dataStatus: DataStatus.AVAILABLE,
          comparisonGroupId: 'canada-imp-test-2024',
        },
      },
    },
  });
}
