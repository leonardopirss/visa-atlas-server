import { Module } from '@nestjs/common';
import { EurostatAdapter } from './adapters/eurostat/eurostat.adapter.js';
import { EurostatClient } from './adapters/eurostat/eurostat.client.js';
import { EurostatReferenceDataService } from './adapters/eurostat/eurostat-reference-data.service.js';
import { UkHomeOfficeAdapter } from './adapters/uk-home-office/uk-home-office.adapter.js';
import { UkHomeOfficeClient } from './adapters/uk-home-office/uk-home-office.client.js';
import { UkHomeOfficeReferenceDataService } from './adapters/uk-home-office/uk-home-office-reference-data.service.js';
import { UkHomeOfficeWorkbookReader } from './adapters/uk-home-office/uk-home-office-workbook.reader.js';
import { EurostatIngestionRunner } from './eurostat-ingestion-runner.service.js';
import { IngestionService } from './ingestion.service.js';
import { IngestionHealthService } from './observability/ingestion-health.service.js';
import { IngestionLogger } from './observability/ingestion-logger.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { ObservationValidator } from './validation/observation.validator.js';
import { UkHomeOfficeIngestionRunner } from './uk-home-office-ingestion-runner.service.js';
import { UkHomeOfficeObservationValidator } from './validation/uk-home-office-observation.validator.js';

@Module({
  providers: [
    EurostatAdapter,
    EurostatClient,
    EurostatReferenceDataService,
    EurostatIngestionRunner,
    UkHomeOfficeAdapter,
    UkHomeOfficeClient,
    UkHomeOfficeReferenceDataService,
    UkHomeOfficeWorkbookReader,
    UkHomeOfficeIngestionRunner,
    UkHomeOfficeObservationValidator,
    IngestionService,
    IngestionHealthService,
    IngestionLogger,
    ObservationValidator,
    PublishReleaseService,
  ],
  exports: [
    EurostatAdapter,
    EurostatIngestionRunner,
    UkHomeOfficeAdapter,
    UkHomeOfficeIngestionRunner,
    IngestionService,
    IngestionHealthService,
    PublishReleaseService,
  ],
})
export class IngestionModule {}
