import { readFile } from 'node:fs/promises';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import { UkHomeOfficeStudyAdapter } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office-study.adapter.js';
import type { UkHomeOfficeRow } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.types.js';

interface Fixture {
  fixtureType: string;
  rows: UkHomeOfficeRow[];
}

describe('UK Home Office Edu_D01 adapter', () => {
  const adapter = new UkHomeOfficeStudyAdapter();
  let rows: UkHomeOfficeRow[];

  beforeAll(async () => {
    const fixture = JSON.parse(
      await readFile('test/fixtures/uk-home-office/edu-d01.synthetic.json', 'utf8'),
    ) as Fixture;
    expect(fixture.fixtureType).toBe('synthetic-structural-only');
    rows = fixture.rows;
  });

  it('agrega somente anos completos para Brasil e preserva níveis do curso', () => {
    expect(adapter.parse(rows)).toEqual([
      expect.objectContaining({
        destinationIso3: 'GBR',
        citizenshipIso3: 'BRA',
        purpose: VisaPurposeCode.STUDY,
        metricType: MetricType.APPLICATIONS_RECEIVED,
        sourceCategoryCode: 'Student:Bachelors',
        period: '2025',
        unit: 'APPLICATIONS',
        value: 20n,
        dataStatus: DataStatus.AVAILABLE,
      }),
      expect.objectContaining({
        sourceCategoryCode: 'Student:Masters',
        period: '2025',
        value: 40n,
      }),
    ]);
  });

  it('rejeita subgrupo de visto desconhecido', () => {
    const invalid = rows.map((row) =>
      row[2] === 'Brazil' ? row.map((value, index) => (index === 4 ? 'Unknown' : value)) : row,
    );
    expect(() => adapter.parse(invalid)).toThrow('UK_HOME_OFFICE_STUDY_VISA_SUBGROUP_UNKNOWN');
  });

  it('rejeita publicação sem cidadania brasileira', () => {
    expect(() => adapter.parse(rows.filter((row) => row[2] !== 'Brazil'))).toThrow(
      'UK_HOME_OFFICE_STUDY_BRAZIL_MISSING',
    );
  });
});
