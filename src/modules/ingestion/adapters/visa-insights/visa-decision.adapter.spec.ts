import { strToU8, zipSync } from 'fflate';
import { MetricType, PopulationBasis, VisaPurposeCode } from '@prisma/client';
import { VisaDecisionAdapter } from './visa-decision.adapter.js';
import { VisaDecisionWorkbookReader } from './visa-decision-workbook.reader.js';
import type { VisaDecisionRow } from './visa-decision.types.js';

const headers = [
  'Year',
  'Quarter',
  'Nationality',
  'Visa type',
  'Visa type subgroup',
  'Outcome',
  'Decisions',
] as const;
const outcomes = ['Issued', 'Refused', 'Withdrawn', 'Lapsed'] as const;

function completeRows(value = 2): VisaDecisionRow[] {
  return [
    ['Vis_D02 synthetic test'],
    [...headers],
    ...outcomes.flatMap((outcome) =>
      [1, 2, 3, 4].map(
        (quarter) =>
          [2025, `2025 Q${quarter}`, 'Brazil', 'Worker', 'Skilled Worker', outcome, value] as const,
      ),
    ),
  ];
}

describe('VisaDecisionAdapter', () => {
  const adapter = new VisaDecisionAdapter();

  it('maps every reviewed outcome and preserves the original category and label', () => {
    expect(adapter.parse(completeRows())).toEqual([
      expect.objectContaining({
        metricType: MetricType.DECISIONS_GRANTED,
        value: 8n,
        sourceCategoryCode: 'Worker:Skilled Worker',
        sourceCategoryLabel: 'Worker — Skilled Worker · Issued',
        populationBasis: PopulationBasis.CITIZENSHIP,
        populationKey: 'BRA',
        programKey: 'uk-entry-clearance:work',
        purpose: VisaPurposeCode.WORK,
        unit: 'COUNT',
      }),
      expect.objectContaining({
        metricType: MetricType.DECISIONS_LAPSED,
        sourceCategoryLabel: 'Worker — Skilled Worker · Lapsed',
      }),
      expect.objectContaining({
        metricType: MetricType.DECISIONS_REFUSED,
        sourceCategoryLabel: 'Worker — Skilled Worker · Refused',
      }),
      expect.objectContaining({
        metricType: MetricType.DECISIONS_WITHDRAWN,
        sourceCategoryLabel: 'Worker — Skilled Worker · Withdrawn',
      }),
    ]);
  });

  it('preserves a confirmed zero for every outcome', () => {
    expect(adapter.parse(completeRows(0)).map(({ value }) => value)).toEqual([0n, 0n, 0n, 0n]);
  });

  it('rejects duplicated source rows instead of double-counting workbook totals', () => {
    const rows = completeRows();
    expect(() => adapter.parse([...rows, rows[2] ?? []])).toThrow('VISA_DECISION_DUPLICATE_ROW');
  });

  it('rejects an incomplete annual outcome series', () => {
    expect(() => adapter.parse(completeRows().slice(0, -1))).toThrow(
      'VISA_DECISION_COMPLETE_YEAR_MISSING',
    );
  });

  it('rejects an unreviewed outcome without silently reclassifying it', () => {
    const rows = completeRows().map((row) =>
      row[5] === 'Issued' ? [...row.slice(0, 5), 'Granted', ...row.slice(6)] : row,
    );
    expect(() => adapter.parse(rows)).toThrow('VISA_DECISION_OUTCOME_UNKNOWN:Granted');
  });
});

describe('VisaDecisionWorkbookReader', () => {
  it('selects Data_Vis_D02 and returns inline source cells unchanged', () => {
    const sheet = `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Outcome</t></is></c><c r="B1" t="inlineStr"><is><t>Issued</t></is></c></row>
    </sheetData></worksheet>`;
    const workbook = `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data_Vis_D02" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const relationships = `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
    const archive = zipSync({
      'xl/workbook.xml': strToU8(workbook),
      'xl/_rels/workbook.xml.rels': strToU8(relationships),
      'xl/worksheets/sheet1.xml': strToU8(sheet),
    });

    expect(new VisaDecisionWorkbookReader().read(Buffer.from(archive))).toEqual([
      ['Outcome', 'Issued'],
    ]);
  });
});
