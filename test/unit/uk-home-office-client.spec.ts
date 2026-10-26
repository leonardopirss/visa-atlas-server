import { jest } from '@jest/globals';
import { UkHomeOfficeClient } from '../../src/modules/ingestion/adapters/uk-home-office/uk-home-office.client.js';

describe('UK Home Office client', () => {
  afterEach(() => jest.restoreAllMocks());

  it('descobre o asset oficial e aceita somente XLSX limitado', async () => {
    const workbook = Buffer.from('PK synthetic workbook');
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          '<a href="https://assets.publishing.service.gov.uk/media/test/occupation-soc2020-visas-datasets-test.xlsx">download</a>',
          { headers: { 'content-type': 'text/html' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(workbook, {
          headers: {
            'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'last-modified': 'Thu, 21 May 2026 00:00:00 GMT',
          },
        }),
      );
    await expect(new UkHomeOfficeClient().fetchBrazilWorkRelease()).resolves.toMatchObject({
      workbook,
      sourceUrl:
        'https://assets.publishing.service.gov.uk/media/test/occupation-soc2020-visas-datasets-test.xlsx',
      sourcePublishedAt: new Date('2026-05-21T00:00:00.000Z'),
    });
  });

  it('rejeita mudança de content-type antes do parsing', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>changed</html>', {
        headers: { 'content-type': 'text/html' },
      }),
    );
    await expect(
      new UkHomeOfficeClient().fetchBrazilWorkRelease(
        'https://assets.publishing.service.gov.uk/media/test/source.xlsx',
      ),
    ).rejects.toThrow('UK_HOME_OFFICE_CONTENT_TYPE_INVALID');
  });
});
