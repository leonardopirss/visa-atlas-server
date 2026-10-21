import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { EurostatIngestionRunner } from '../modules/ingestion/eurostat-ingestion-runner.service.js';

const logger = new Logger('EurostatIngestionCli');

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule);
  try {
    const result = await application.get(EurostatIngestionRunner).run();
    logger.log(JSON.stringify({ event: 'eurostat.ingestion.finished', ...result }));
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : 'Unknown ingestion failure';
  logger.error(JSON.stringify({ event: 'eurostat.ingestion.failed', reason }));
  process.exitCode = 1;
});
