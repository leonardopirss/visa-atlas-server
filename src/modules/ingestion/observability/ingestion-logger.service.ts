import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IngestionLogger {
  private readonly logger = new Logger('Ingestion');

  started(jobId: string, datasetId: string): void {
    this.logger.log(JSON.stringify({ event: 'ingestion.started', jobId, datasetId }));
  }

  completed(jobId: string, releaseId: string, observationCount: number): void {
    this.logger.log(
      JSON.stringify({ event: 'ingestion.completed', jobId, releaseId, observationCount }),
    );
  }

  failed(jobId: string, reason: string): void {
    this.logger.error(JSON.stringify({ event: 'ingestion.failed', jobId, reason }));
  }
}
