import {
  loadCountryCatalog,
  parseCountryCatalog,
} from '../../src/modules/countries/services/country-catalog.service.js';

describe('world country catalog', () => {
  it('contains unique assigned ISO2 and ISO3 codes with required localized fields', async () => {
    const catalog = await loadCountryCatalog();
    const iso2 = catalog.countries.map((country) => country.iso2);
    const iso3 = catalog.countries.map((country) => country.iso3);

    expect(catalog.countries).toHaveLength(249);
    expect(new Set(iso2).size).toBe(249);
    expect(new Set(iso3).size).toBe(249);
    expect(catalog.countries).toEqual(
      expect.arrayContaining([
        { iso2: 'AU', iso3: 'AUS', namePt: 'Austrália', region: 'Oceania' },
        { iso2: 'CA', iso3: 'CAN', namePt: 'Canadá', region: 'Américas' },
        { iso2: 'RU', iso3: 'RUS', namePt: 'Rússia', region: 'Europa' },
      ]),
    );
    for (const country of catalog.countries) {
      expect(country.namePt).not.toBe('');
      expect(country.region).not.toBe('');
    }
  });

  it('keeps source version, checksum and ODbL attribution with the catalog', async () => {
    const catalog = await loadCountryCatalog();

    expect(catalog.catalogVersion).toBe('world-countries-5.1.0+cldr-48.0-pt-BR');
    expect(catalog.source).toMatchObject({
      name: 'mledoze/countries',
      version: '5.1.0',
      sourceSha256: '359431fb9475666dfad1ea5e72e53521cef40520f65eecd08e02ba569eb8491b',
    });
    expect(catalog.license).toMatchObject({ spdx: 'ODbL-1.0' });
    expect(catalog.license.notice).toContain('Open Database License');
  });

  it('rejects duplicate ISO codes before synchronization', () => {
    const duplicate = {
      schemaVersion: 1,
      catalogVersion: 'test',
      source: {
        name: 'test',
        version: '1',
        url: 'https://example.test',
        sourceSha256: 'test',
        names: 'test',
      },
      license: {
        spdx: 'test',
        url: 'https://example.test/license',
        notice: 'test',
      },
      countries: [
        { iso2: 'AA', iso3: 'AAA', namePt: 'A', region: 'A' },
        { iso2: 'AA', iso3: 'BBB', namePt: 'B', region: 'B' },
      ],
    };

    expect(() => parseCountryCatalog(duplicate)).toThrow('duplicate code');
  });
});
