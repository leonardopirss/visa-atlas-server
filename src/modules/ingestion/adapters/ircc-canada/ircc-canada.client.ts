import { Injectable } from '@nestjs/common';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import { IRCC_CANADA_WORKBOOK_URL } from './ircc-canada.config.js';
import type { IrccCanadaReleasePayload } from './ircc-canada.types.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_WORKBOOK_BYTES = 2 * 1024 * 1024;

@Injectable()
export class IrccCanadaClient {
  async fetchBrazilWorkRelease(): Promise<IrccCanadaReleasePayload> {
    const response = await fetch(IRCC_CANADA_WORKBOOK_URL, {
      headers: { Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: 'follow',
    });
    if (!response.ok)
      throw new IngestionValidationError(`IRCC_CANADA_HTTP_ERROR:${response.status}`);
    const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('spreadsheetml.sheet') && !contentType.includes('octet-stream')) {
      throw new IngestionValidationError(`IRCC_CANADA_CONTENT_TYPE_INVALID:${contentType}`);
    }
    const workbook = Buffer.from(await response.arrayBuffer());
    if (workbook.byteLength > MAX_WORKBOOK_BYTES) {
      throw new IngestionValidationError('IRCC_CANADA_RESPONSE_TOO_LARGE');
    }
    const modified = response.headers.get('last-modified');
    const parsed = modified ? new Date(modified) : null;
    return {
      rawPayload: workbook.toString('base64'),
      workbook,
      fetchedAt: new Date(),
      sourcePublishedAt: parsed && !Number.isNaN(parsed.getTime()) ? parsed : null,
    };
  }
}
