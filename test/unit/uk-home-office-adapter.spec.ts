import { readFile } from 'node:fs/promises';
import { DataStatus, MetricType } from '@prisma/client';
import { UkHomeOfficeAdapter } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.adapter.js';
import type { UkHomeOfficeRow } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.types.js';

interface Fixture {
  fixtureType: string;
  rows: UkHomeOfficeRow[];
}

describe('UK Home Office Occ_D02 adapter', () => {
  const adapter = new UkHomeOfficeAdapter();
  let rows: UkHomeOfficeRow[];

  beforeAll(async () => {
    const fixture = JSON.parse(
      await readFile('test/fixtures/uk-home-office/occ-d02.synthetic.json', 'utf8'),
    ) as Fixture;
    expect(fixture.fixtureType).toBe('synthetic-structural-only');
    rows = fixture.rows;
  });

  it('agrega somente anos completos para Brasil e preserva subcategorias', () => {
    expect(adapter.parse(rows)).toEqual([
      expect.objectContaining({
        destinationIso3: 'GBR',
        citizenshipIso3: 'BRA',
        metricType: MetricType.WORK_VISAS_ISSUED,
        sourceCategoryCode: 'Temporary Worker:Creative Worker',
        period: '2025',
        unit: 'VISAS',
        value: 14n,
        dataStatus: DataStatus.AVAILABLE,
      }),
      expect.objectContaining({
        sourceCategoryCode: 'Worker:Skilled Worker',
        period: '2025',
        value: 42n,
      }),
    ]);
  });

  it('rejeita categoria de visto desconhecida', () => {
    const invalid = rows.map((row) =>
      row[2] === 'Brazil' ? row.map((value, index) => (index === 4 ? 'Unknown' : value)) : row,
    );
    expect(() => adapter.parse(invalid)).toThrow('UK_HOME_OFFICE_VISA_TYPE_UNKNOWN');
  });

  it('rejeita publicação sem cidadania brasileira', () => {
    expect(() => adapter.parse(rows.filter((row) => row[2] !== 'Brazil'))).toThrow(
      'UK_HOME_OFFICE_BRAZIL_MISSING',
    );
  });
});
