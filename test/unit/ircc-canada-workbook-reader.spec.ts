import { strToU8, zipSync } from 'fflate';
import { IrccCanadaWorkbookReader } from '../../src/modules/ingestion/adapters/ircc-canada/ircc-canada-workbook.reader.js';

describe('IRCC Canada XLSX reader', () => {
  it('resolves the worksheet regardless of relationship attribute order', () => {
    const workbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8(
          '<workbook xmlns:r="relationships"><sheets><sheet name="Data" r:id="rId6"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<Relationships><Relationship Target="worksheets/sheet1.xml" Id="rId6" /></Relationships>',
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Brazil</t></is></c><c r="B1" t="inlineStr"><is><t>15,655</t></is></c></row></sheetData></worksheet>',
        ),
      }),
    );

    expect(new IrccCanadaWorkbookReader().read(workbook)).toEqual([['Brazil', '15,655']]);
  });

  it('rejeita arquivo sem planilha', () => {
    const workbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8('<workbook><sheets/></workbook>'),
        'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
      }),
    );
    expect(() => new IrccCanadaWorkbookReader().read(workbook)).toThrow(
      'IRCC_CANADA_WORKSHEET_MISSING',
    );
  });
});
