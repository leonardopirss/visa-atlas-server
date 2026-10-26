import { readFile } from 'node:fs/promises';
import { DataStatus, MetricType } from '@prisma/client';
import { IrccCanadaAdapter } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.adapter.js';
import type { IrccCanadaRow } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.types.js';

interface Fixture {
  fixtureType: string;
  rows: IrccCanadaRow[];
}

describe('IRCC Canada annual IMP adapter', () => {
  const adapter = new IrccCanadaAdapter();
  let rows: IrccCanadaRow[];

  beforeAll(async () => {
    const fixture = JSON.parse(
      await readFile('test/fixtures/ircc-canada/imp-year-end.synthetic.json', 'utf8'),
    ) as Fixture;
    expect(fixture.fixtureType).toBe('synthetic-structural-only');
    rows = fixture.rows;
  });

  it('maps only Brazilian annual IMP holders without summing periods', () => {
    expect(adapter.parse(rows)).toEqual([
      expect.objectContaining({
        destinationIso3: 'CAN',
        citizenshipIso3: 'BRA',
        metricType: MetricType.VALID_PERMIT_HOLDERS,
        sourceCategoryCode: 'IMP',
        period: '2022',
        unit: 'HOLDERS',
        value: 13_795n,
        dataStatus: DataStatus.AVAILABLE,
      }),
      expect.objectContaining({ period: '2023', value: 16_485n }),
      expect.objectContaining({ period: '2024', value: 15_655n }),
    ]);
  });

  it('preserva supressão oficial como valor nulo', () => {
    const suppressed = rows.map((row) =>
      row[0] === 'Brazil' ? row.map((value, index) => (index === 3 ? '--' : value)) : row,
    );
    expect(adapter.parse(suppressed)[2]).toMatchObject({
      period: '2024',
      value: null,
      dataStatus: DataStatus.SUPPRESSED,
    });
  });

  it('rejeita publicação sem cidadania brasileira', () => {
    expect(() => adapter.parse(rows.filter((row) => row[0] !== 'Brazil'))).toThrow(
      'IRCC_CANADA_BRAZIL_MISSING',
    );
  });
});
