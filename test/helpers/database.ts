import {
  DataStatus,
  MetricType,
  PopulationBasis,
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
  await prisma.visaPurpose.createMany({
    data: [
      { code: VisaPurposeCode.WORK, label: 'Trabalho' },
      { code: VisaPurposeCode.STUDY, label: 'Estudo' },
    ],
  });
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
      populationBasis: PopulationBasis.CITIZENSHIP,
      populationKey: 'BRA',
      programKey: 'ALL',
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
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
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
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
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
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
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

export async function seedPublishedStudyFixture(): Promise<void> {
  await prisma.sourceDataset.create({
    data: {
      id: 'migr-resedu',
      organizationId: 'eurostat',
      code: 'migr_resedu',
      url: 'https://ec.europa.eu/eurostat/databrowser/view/migr_resedu/default/table',
      methodologyUrl: 'https://ec.europa.eu/eurostat/cache/metadata/en/migr_res_esms.htm',
      schemaVersion: 'synthetic-test-v1',
    },
  });
  await prisma.comparisonGroup.createMany({
    data: [
      {
        id: 'test-study-2024',
        datasetId: 'migr-resedu',
        metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'ALL',
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.STUDY,
        period: '2024',
        unit: 'PER',
        methodologyVersion: 'synthetic-test-v1',
      },
      {
        id: 'test-study-2025',
        datasetId: 'migr-resedu',
        metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'ALL',
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.STUDY,
        period: '2025',
        unit: 'PER',
        methodologyVersion: 'synthetic-test-v1',
      },
    ],
  });
  await prisma.datasetRelease.create({
    data: {
      id: 'test-study-release-2025',
      datasetId: 'migr-resedu',
      sourcePublishedAt: new Date('2026-09-28T00:00:00Z'),
      fetchedAt: new Date('2026-11-16T00:00:00Z'),
      validatedAt: new Date('2026-11-16T00:00:00Z'),
      publishedAt: new Date('2026-11-16T00:00:00Z'),
      checksum: 'synthetic-study-contract-fixture',
      status: ReleaseStatus.PUBLISHED,
      observations: {
        create: [
          {
            destinationIso3: 'ESP',
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.STUDY,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EDUC',
            sourceCategoryLabel: 'Education reasons',
            period: '2024',
            unit: 'PER',
            value: 18n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-study-2024',
          },
          {
            destinationIso3: 'DEU',
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.STUDY,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EDUC',
            sourceCategoryLabel: 'Education reasons',
            period: '2024',
            unit: 'PER',
            value: 8n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-study-2024',
          },
          {
            destinationIso3: 'ESP',
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.STUDY,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EDUC',
            sourceCategoryLabel: 'Education reasons',
            period: '2025',
            unit: 'PER',
            value: 24n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-study-2025',
          },
          {
            destinationIso3: 'DEU',
            populationBasis: PopulationBasis.CITIZENSHIP,
            populationKey: 'BRA',
            programKey: 'ALL',
            citizenshipIso3: 'BRA',
            purposeCode: VisaPurposeCode.STUDY,
            metricType: MetricType.FIRST_RESIDENCE_PERMITS_GRANTED,
            sourceCategoryCode: 'EDUC',
            sourceCategoryLabel: 'Education reasons',
            period: '2025',
            unit: 'PER',
            value: 12n,
            dataStatus: DataStatus.AVAILABLE,
            comparisonGroupId: 'test-study-2025',
          },
        ],
      },
    },
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
      {
        id: 'uk-study-visas-test',
        organizationId: 'uk-home-office-test',
        code: 'Edu_D01_TEST',
        url: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables',
        schemaVersion: 'synthetic-test-v1',
      },
      {
        id: 'canada-study-test',
        organizationId: 'ircc-test',
        code: 'STUDY_CITZ_YEAR_END_TEST',
        url: 'https://open.canada.ca/data/en/dataset/90115b00-f9b8-49e8-afa3-b4cff8facaee',
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
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'ALL',
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
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'ALL',
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.WORK,
        period: '2024',
        unit: 'HOLDERS',
        methodologyVersion: 'synthetic-test-v1',
      },
      {
        id: 'uk-study-visas-test-2025',
        datasetId: 'uk-study-visas-test',
        metricType: MetricType.APPLICATIONS_RECEIVED,
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'ALL',
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.STUDY,
        period: '2025',
        unit: 'APPLICATIONS',
        methodologyVersion: 'synthetic-test-v1',
      },
      {
        id: 'canada-study-test-2024',
        datasetId: 'canada-study-test',
        metricType: MetricType.VALID_PERMIT_HOLDERS,
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'ALL',
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.STUDY,
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
          populationBasis: PopulationBasis.CITIZENSHIP,
          populationKey: 'BRA',
          programKey: 'ALL',
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
          populationBasis: PopulationBasis.CITIZENSHIP,
          populationKey: 'BRA',
          programKey: 'ALL',
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
  await prisma.datasetRelease.create({
    data: {
      id: 'uk-study-test-release-2025',
      datasetId: 'uk-study-visas-test',
      sourcePublishedAt: new Date('2026-05-21T00:00:00Z'),
      fetchedAt: new Date('2026-11-16T00:00:00Z'),
      validatedAt: new Date('2026-11-16T00:00:00Z'),
      publishedAt: new Date('2026-11-16T00:00:00Z'),
      checksum: 'synthetic-uk-study-fixture',
      status: ReleaseStatus.PUBLISHED,
      observations: {
        create: {
          destinationIso3: 'GBR',
          populationBasis: PopulationBasis.CITIZENSHIP,
          populationKey: 'BRA',
          programKey: 'ALL',
          citizenshipIso3: 'BRA',
          purposeCode: VisaPurposeCode.STUDY,
          metricType: MetricType.APPLICATIONS_RECEIVED,
          sourceCategoryCode: 'Student:Masters',
          sourceCategoryLabel: 'Student — Masters',
          period: '2025',
          unit: 'APPLICATIONS',
          value: 60n,
          dataStatus: DataStatus.AVAILABLE,
          comparisonGroupId: 'uk-study-visas-test-2025',
        },
      },
    },
  });
  await prisma.datasetRelease.create({
    data: {
      id: 'canada-study-test-release-2024',
      datasetId: 'canada-study-test',
      sourcePublishedAt: new Date('2025-12-31T00:00:00Z'),
      fetchedAt: new Date('2026-11-16T00:00:00Z'),
      validatedAt: new Date('2026-11-16T00:00:00Z'),
      publishedAt: new Date('2026-11-16T00:00:00Z'),
      checksum: 'synthetic-canada-study-fixture',
      status: ReleaseStatus.PUBLISHED,
      observations: {
        create: {
          destinationIso3: 'CAN',
          populationBasis: PopulationBasis.CITIZENSHIP,
          populationKey: 'BRA',
          programKey: 'ALL',
          citizenshipIso3: 'BRA',
          purposeCode: VisaPurposeCode.STUDY,
          metricType: MetricType.VALID_PERMIT_HOLDERS,
          sourceCategoryCode: 'STUDY_PERMIT',
          sourceCategoryLabel: 'Study permit holders',
          period: '2024',
          unit: 'HOLDERS',
          value: 12_775n,
          dataStatus: DataStatus.AVAILABLE,
          comparisonGroupId: 'canada-study-test-2024',
        },
      },
    },
  });
}

export async function seedVisaDecisionInsightsFixture(): Promise<void> {
  const datasetId = 'uk-vis-decisions-e2e';
  const programKey = 'uk-entry-clearance:work';
  const methodologyVersion = 'synthetic-vis-d02-e2e-v1';
  await prisma.sourceDataset.create({
    data: {
      id: datasetId,
      organizationId: 'uk-home-office-test',
      code: 'Vis_D02_E2E_SYNTHETIC',
      url: 'https://www.gov.uk/government/statistical-data-sets/immigration-system-statistics-data-tables',
      methodologyUrl:
        'https://www.gov.uk/government/publications/immigration-system-statistics-user-guide',
      schemaVersion: methodologyVersion,
    },
  });
  await prisma.comparisonGroup.createMany({
    data: [2024, 2025].flatMap((year) =>
      (
        [
          [MetricType.DECISIONS_GRANTED, 'COUNT', 'granted'],
          [MetricType.DECISIONS_REFUSED, 'COUNT', 'refused'],
          [MetricType.APPROVAL_RATE, 'BASIS_POINTS', 'approval'],
        ] as const
      ).map(([metricType, unit, slug]) => ({
        id: `e2e-vis-d02-${slug}-${year}`,
        datasetId,
        metricType: metricType as MetricType,
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey,
        citizenshipIso3: 'BRA',
        purposeCode: VisaPurposeCode.WORK,
        period: String(year),
        unit,
        methodologyVersion,
      })),
    ),
  });
  const release = await prisma.datasetRelease.create({
    data: {
      id: 'e2e-vis-d02-release',
      datasetId,
      sourcePublishedAt: new Date('2026-11-10T00:00:00Z'),
      fetchedAt: new Date('2026-11-17T00:00:00Z'),
      validatedAt: new Date('2026-11-17T00:00:00Z'),
      publishedAt: new Date('2026-11-17T00:00:00Z'),
      checksum: 'synthetic-vis-d02-e2e-release',
      status: ReleaseStatus.PUBLISHED,
      qualityReport: {
        fixture: 'synthetic-e2e',
        warning: 'Not production data',
      },
    },
  });

  for (const [year, grantedValue, refusedValue] of [
    [2024, 2n, 2n],
    [2025, 3n, 1n],
  ] as const) {
    const common = {
      releaseId: release.id,
      destinationIso3: 'GBR',
      populationBasis: PopulationBasis.CITIZENSHIP,
      populationKey: 'BRA',
      programKey,
      citizenshipIso3: 'BRA',
      purposeCode: VisaPurposeCode.WORK,
      period: String(year),
      unit: 'COUNT',
      dataStatus: DataStatus.AVAILABLE,
      sourceCategoryCode: 'Worker:Skilled Worker',
      sourceCategoryLabel: 'Worker — Skilled Worker',
    } as const;
    const granted = await prisma.metricObservation.create({
      data: {
        ...common,
        metricType: MetricType.DECISIONS_GRANTED,
        value: grantedValue,
        comparisonGroupId: `e2e-vis-d02-granted-${year}`,
      },
    });
    const refused = await prisma.metricObservation.create({
      data: {
        ...common,
        metricType: MetricType.DECISIONS_REFUSED,
        value: refusedValue,
        comparisonGroupId: `e2e-vis-d02-refused-${year}`,
      },
    });
    const rate = await prisma.metricObservation.create({
      data: {
        ...common,
        metricType: MetricType.APPROVAL_RATE,
        sourceCategoryCode: `DERIVED:${programKey}`,
        sourceCategoryLabel: 'Conjunto revisado de modalidades · taxa derivada',
        unit: 'BASIS_POINTS',
        value: year === 2025 ? 7_500n : 5_000n,
        precision: 2,
        comparisonGroupId: `e2e-vis-d02-approval-${year}`,
      },
    });
    await prisma.metricDerivation.create({
      data: {
        observationId: rate.id,
        formula: 'APPROVAL_RATE',
        precision: 2,
        validatedAt: new Date('2026-11-17T00:00:00Z'),
        qualityReport: { fixture: 'synthetic-e2e', arithmetic: 'integer-half-up' },
        operands: {
          create: [
            {
              observationId: granted.id,
              role: 'NUMERATOR_COMPONENT',
            },
            {
              observationId: granted.id,
              role: 'DENOMINATOR_COMPONENT',
            },
            {
              observationId: refused.id,
              role: 'DENOMINATOR_COMPONENT',
            },
          ],
        },
      },
    });
  }
}
