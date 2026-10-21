export class IngestionValidationError extends Error {
  constructor(readonly reason: string) {
    super(`Ingestion validation failed: ${reason}`);
    this.name = 'IngestionValidationError';
  }
}
