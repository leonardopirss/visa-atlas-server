import { Module } from '@nestjs/common';
import { EurostatAdapter } from './adapters/eurostat/eurostat.adapter.js';
import { EurostatClient } from './adapters/eurostat/eurostat.client.js';
import { EurostatReferenceDataService } from './adapters/eurostat/eurostat-reference-data.service.js';
import { IrccCanadaAdapter } from './adapters/ircc-canada/ircc-canada.adapter.js';
import { IrccCanadaClient } from './adapters/ircc-canada/ircc-canada.client.js';
import { IrccCanadaReferenceDataService } from './adapters/ircc-canada/ircc-canada-reference-data.service.js';
import { IrccCanadaWorkbookReader } from './adapters/ircc-canada/ircc-canada-workbook.reader.js';
import { UkHomeOfficeAdapter } from './adapters/uk-home-office/uk-home-office.adapter.js';
import { UkHomeOfficeClient } from './adapters/uk-home-office/uk-home-office.client.js';
import { UkHomeOfficeReferenceDataService } from './adapters/uk-home-office/uk-home-office-reference-data.service.js';
import { UkHomeOfficeWorkbookReader } from './adapters/uk-home-office/uk-home-office-workbook.reader.js';
import { EurostatIngestionRunner } from './eurostat-ingestion-runner.service.js';
import { IngestionService } from './ingestion.service.js';
import { IrccCanadaIngestionRunner } from './ircc-canada-ingestion-runner.service.js';
import { IngestionHealthService } from './observability/ingestion-health.service.js';
import { IngestionLogger } from './observability/ingestion-logger.service.js';
import { PublishReleaseService } from './services/publish-release.service.js';
import { IrccCanadaObservationValidator } from './validation/ircc-canada-observation.validator.js';
import { ObservationValidator } from './validation/observation.validator.js';
import { UkHomeOfficeIngestionRunner } from './uk-home-office-ingestion-runner.service.js';
import { UkHomeOfficeObservationValidator } from './validation/uk-home-office-observation.validator.js';

@Module({
  providers: [
    EurostatAdapter,
    EurostatClient,
    EurostatReferenceDataService,
    EurostatIngestionRunner,
    IrccCanadaAdapter,
    IrccCanadaClient,
    IrccCanadaReferenceDataService,
    IrccCanadaWorkbookReader,
    IrccCanadaIngestionRunner,
    IrccCanadaObservationValidator,
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
    IrccCanadaAdapter,
    IrccCanadaIngestionRunner,
    UkHomeOfficeAdapter,
    UkHomeOfficeIngestionRunner,
    IngestionService,
    IngestionHealthService,
    PublishReleaseService,
  ],
})
export class IngestionModule {}
