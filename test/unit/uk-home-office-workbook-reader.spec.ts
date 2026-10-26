import { strToU8, zipSync } from 'fflate';
import { UkHomeOfficeWorkbookReader } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office-workbook.reader.js';

describe('UK Home Office XLSX reader', () => {
  it('resolve a planilha por relacionamento e decodifica strings compartilhadas', () => {
    const workbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8(
          '<workbook xmlns:r="relationships"><sheets><sheet name="Data_Occ_D02" r:id="rId8"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<Relationships><Relationship Id="rId8" Target="worksheets/sheet8.xml"/></Relationships>',
        ),
        'xl/sharedStrings.xml': strToU8('<sst><si><t>Brazil</t></si><si><t>Worker</t></si></sst>'),
        'xl/worksheets/sheet8.xml': strToU8(
          '<worksheet><sheetData><row r="1"><c r="A1"><v>2025</v></c><c r="C1" t="s"><v>0</v></c><c r="E1" t="s"><v>1</v></c></row></sheetData></worksheet>',
        ),
      }),
    );

    expect(new UkHomeOfficeWorkbookReader().read(workbook)).toEqual([
      [2025, undefined, 'Brazil', undefined, 'Worker'],
    ]);
  });

  it('rejeita mudança estrutural sem a planilha Occ_D02', () => {
    const workbook = Buffer.from(
      zipSync({
        'xl/workbook.xml': strToU8('<workbook><sheets/></workbook>'),
        'xl/_rels/workbook.xml.rels': strToU8('<Relationships/>'),
      }),
    );
    expect(() => new UkHomeOfficeWorkbookReader().read(workbook)).toThrow(
      'UK_HOME_OFFICE_WORKSHEET_MISSING',
    );
  });
});
