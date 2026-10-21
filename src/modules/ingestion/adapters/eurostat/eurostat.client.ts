import { Injectable } from '@nestjs/common';
import type { EurostatPayload } from './eurostat.types.js';
import { EUROSTAT_API_URL } from './eurostat.config.js';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface EurostatReleasePayload {
  rawPayload: string;
  payload: EurostatPayload;
  fetchedAt: Date;
  sourcePublishedAt: Date | null;
}

@Injectable()
export class EurostatClient {
  async fetchBrazilWorkRelease(): Promise<EurostatReleasePayload> {
    const response = await fetch(EUROSTAT_API_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new IngestionValidationError(`EUROSTAT_HTTP_ERROR:${response.status}`);
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_RESPONSE_BYTES) {
      throw new IngestionValidationError('EUROSTAT_RESPONSE_TOO_LARGE');
    }
    const rawPayload = await response.text();
    if (Buffer.byteLength(rawPayload, 'utf8') > MAX_RESPONSE_BYTES) {
      throw new IngestionValidationError('EUROSTAT_RESPONSE_TOO_LARGE');
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(rawPayload);
    } catch {
      throw new IngestionValidationError('EUROSTAT_JSON_INVALID');
    }
    if (!this.isPayload(decoded)) {
      throw new IngestionValidationError('EUROSTAT_PAYLOAD_INVALID');
    }

    return {
      rawPayload,
      payload: decoded,
      fetchedAt: new Date(),
      sourcePublishedAt: this.parseUpdatedAt(decoded.updated),
    };
  }

  private isPayload(value: unknown): value is EurostatPayload {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return (
      Array.isArray(candidate.id) &&
      candidate.id.every((item) => typeof item === 'string') &&
      Array.isArray(candidate.size) &&
      candidate.size.every((item) => Number.isInteger(item) && Number(item) >= 0) &&
      typeof candidate.dimension === 'object' &&
      candidate.dimension !== null &&
      typeof candidate.value === 'object' &&
      candidate.value !== null
    );
  }

  private parseUpdatedAt(value: string | undefined): Date | null {
    if (value === undefined) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
}
