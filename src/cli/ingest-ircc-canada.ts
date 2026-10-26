import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { IrccCanadaIngestionRunner } from '../modules/ingestion/ircc-canada-ingestion-runner.service.js';

const logger = new Logger('IrccCanadaIngestionCli');

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule);
  try {
    const result = await application.get(IrccCanadaIngestionRunner).run();
    logger.log(JSON.stringify({ event: 'ircc-canada.ingestion.finished', ...result }));
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : 'Unknown ingestion failure';
  logger.error(JSON.stringify({ event: 'ircc-canada.ingestion.failed', reason }));
  process.exitCode = 1;
});
