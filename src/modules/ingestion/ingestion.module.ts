import { Module } from '@nestjs/common';
import { EurostatAdapter } from './adapters/eurostat/eurostat.adapter.js';
import { EurostatClient } from './adapters/eurostat/eurostat.client.js';
import { EurostatReferenceDataService } from './adapters/eurostat/eurostat-reference-data.service.js';
import { EurostatIngestionRunner } from './eurostat-ingestion-runner.service.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionHealthService } from './observability/ingestion-health.service.js';
import { IngestionLogger } from './observability/ingestion-logger.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { ObservationValidator } from './validation/observation.validator.js';

@Module({
  providers: [
    EurostatAdapter,
    EurostatClient,
    EurostatReferenceDataService,
    EurostatIngestionRunner,
    IngestionService,
    IngestionHealthService,
    IngestionLogger,
    ObservationValidator,
    PublishReleaseService,
  ],
  exports: [
    EurostatAdapter,
    EurostatIngestionRunner,
    IngestionService,
    IngestionHealthService,
    PublishReleaseService,
  ],
})
export class IngestionModule {}
