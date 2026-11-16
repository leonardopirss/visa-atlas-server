import { readFile } from 'node:fs/promises';
import { DataStatus, MetricType, VisaPurposeCode } from '@prisma/client';
import { IrccCanadaStudyAdapter } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada-study.adapter.js';
import type { IrccCanadaRow } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada.types.js';

interface Fixture {
  fixtureType: string;
  rows: IrccCanadaRow[];
}

describe('IRCC Canada annual study permit adapter', () => {
  const adapter = new IrccCanadaStudyAdapter();
  let rows: IrccCanadaRow[];

  beforeAll(async () => {
    const fixture = JSON.parse(
      await readFile('test/fixtures/ircc-canada/study-year-end.synthetic.json', 'utf8'),
    ) as Fixture;
    expect(fixture.fixtureType).toBe('synthetic-structural-only');
    rows = fixture.rows;
  });

  it('mapeia os titulares brasileiros sem somar períodos', () => {
    expect(adapter.parse(rows)).toEqual([
      expect.objectContaining({
        destinationIso3: 'CAN',
        citizenshipIso3: 'BRA',
        purpose: VisaPurposeCode.STUDY,
        metricType: MetricType.VALID_PERMIT_HOLDERS,
        sourceCategoryCode: 'STUDY_PERMIT',
        period: '2022',
        unit: 'HOLDERS',
        value: 14_405n,
        dataStatus: DataStatus.AVAILABLE,
      }),
      expect.objectContaining({ period: '2023', value: 15_570n }),
      expect.objectContaining({ period: '2024', value: 12_775n }),
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
      'IRCC_CANADA_STUDY_BRAZIL_MISSING',
    );
  });
});
