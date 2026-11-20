import { Injectable } from '@nestjs/common';
import { UkHomeOfficeWorkbookReader } from '../uk-home-office/uk-home-office-workbook.reader.js';
import { VISA_DECISION_WORKSHEET } from './visa-decision.config.js';
import type { VisaDecisionRow } from './visa-decision.types.js';

@Injectable()
export class VisaDecisionWorkbookReader {
  constructor(
    private readonly workbookReader: UkHomeOfficeWorkbookReader = new UkHomeOfficeWorkbookReader(),
  ) {}

  read(buffer: Buffer): VisaDecisionRow[] {
    return this.workbookReader.read(buffer, VISA_DECISION_WORKSHEET);
  }
}
