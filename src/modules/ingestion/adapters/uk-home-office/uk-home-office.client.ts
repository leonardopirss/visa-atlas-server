import { Injectable } from '@nestjs/common';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import { UK_HOME_OFFICE_PAGE_URL } from './uk-home-office.config.js';
import type { UkHomeOfficeReleasePayload } from './uk-home-office.types.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const MAX_WORKBOOK_BYTES = 12 * 1024 * 1024;

@Injectable()
export class UkHomeOfficeClient {
  async fetchBrazilWorkRelease(configuredUrl?: string): Promise<UkHomeOfficeReleasePayload> {
    const sourceUrl = configuredUrl ?? (await this.discoverLatestWorkbook());
    const response = await fetch(sourceUrl, {
      headers: {
        Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new IngestionValidationError(`UK_HOME_OFFICE_HTTP_ERROR:${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (
      !contentType.includes('spreadsheetml.sheet') &&
      !contentType.includes('application/octet-stream')
    ) {
      throw new IngestionValidationError(`UK_HOME_OFFICE_CONTENT_TYPE_INVALID:${contentType}`);
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_WORKBOOK_BYTES) {
      throw new IngestionValidationError('UK_HOME_OFFICE_RESPONSE_TOO_LARGE');
    }
    const workbook = Buffer.from(await response.arrayBuffer());
    if (workbook.byteLength > MAX_WORKBOOK_BYTES) {
      throw new IngestionValidationError('UK_HOME_OFFICE_RESPONSE_TOO_LARGE');
    }
    return {
      rawPayload: workbook.toString('base64'),
      workbook,
      sourceUrl,
      fetchedAt: new Date(),
      sourcePublishedAt: this.httpDate(response.headers.get('last-modified')),
    };
  }

  private async discoverLatestWorkbook(): Promise<string> {
    const response = await fetch(UK_HOME_OFFICE_PAGE_URL, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new IngestionValidationError(`UK_HOME_OFFICE_INDEX_HTTP_ERROR:${response.status}`);
    }
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('text/html')) {
      throw new IngestionValidationError('UK_HOME_OFFICE_INDEX_CONTENT_TYPE_INVALID');
    }
    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_PAGE_BYTES) {
      throw new IngestionValidationError('UK_HOME_OFFICE_INDEX_TOO_LARGE');
    }
    const matches = [
      ...html.matchAll(/href="([^"]*occupation-soc2020-visas-datasets-[^"]+\.xlsx)"/gi),
    ];
    const href = matches[0]?.[1]?.replaceAll('&amp;', '&');
    if (!href) throw new IngestionValidationError('UK_HOME_OFFICE_WORKBOOK_LINK_MISSING');
    const url = new URL(href, UK_HOME_OFFICE_PAGE_URL);
    if (url.protocol !== 'https:' || url.hostname !== 'assets.publishing.service.gov.uk') {
      throw new IngestionValidationError('UK_HOME_OFFICE_WORKBOOK_HOST_INVALID');
    }
    return url.toString();
  }

  private httpDate(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
