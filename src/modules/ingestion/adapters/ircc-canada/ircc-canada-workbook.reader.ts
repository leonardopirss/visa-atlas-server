import { Injectable } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import type { IrccCanadaCell, IrccCanadaRow } from './ircc-canada.types.js';

const MAX_UNCOMPRESSED_BYTES = 5 * 1024 * 1024;

@Injectable()
export class IrccCanadaWorkbookReader {
  read(buffer: Buffer): IrccCanadaRow[] {
    let archive: Record<string, Uint8Array>;
    try {
      archive = unzipSync(new Uint8Array(buffer));
    } catch {
      throw new IngestionValidationError('IRCC_CANADA_XLSX_INVALID');
    }
    const size = Object.values(archive).reduce((total, entry) => total + entry.byteLength, 0);
    if (size > MAX_UNCOMPRESSED_BYTES) {
      throw new IngestionValidationError('IRCC_CANADA_XLSX_EXPANDED_TOO_LARGE');
    }
    const workbook = this.text(archive, 'xl/workbook.xml');
    const relationships = this.text(archive, 'xl/_rels/workbook.xml.rels');
    const relationshipId = workbook.match(/<sheet\b[^>]*r:id="([^"]+)"[^>]*\/?\s*>/i)?.[1];
    if (!relationshipId) throw new IngestionValidationError('IRCC_CANADA_WORKSHEET_MISSING');
    const relationship = [...relationships.matchAll(/<Relationship\b([^>]*)\/?\s*>/gi)].find(
      (match) => match[1]?.match(/\bId="([^"]+)"/i)?.[1] === relationshipId,
    );
    const target = relationship?.[1]?.match(/\bTarget="([^"]+)"/i)?.[1];
    if (!target) throw new IngestionValidationError('IRCC_CANADA_WORKSHEET_RELATION_MISSING');
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    return this.rows(this.text(archive, path));
  }

  private text(archive: Record<string, Uint8Array>, path: string): string {
    const entry = archive[path];
    if (!entry) throw new IngestionValidationError(`IRCC_CANADA_XLSX_ENTRY_MISSING:${path}`);
    return new TextDecoder().decode(entry);
  }

  private rows(xml: string): IrccCanadaRow[] {
    return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
      const row: IrccCanadaCell[] = [];
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attributes = cellMatch[1] ?? '';
        const content = cellMatch[2] ?? '';
        const column = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
        if (!column) continue;
        const index =
          [...column].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0) -
          1;
        const inline = content.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1];
        const raw = content.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        const value = inline ?? raw;
        row[index] = value === undefined ? null : this.decodeXml(value);
      }
      return row;
    });
  }

  private decodeXml(value: string): string {
    return value
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
        String.fromCodePoint(Number.parseInt(code, 16)),
      )
      .replaceAll('&quot;', '"')
      .replaceAll('&apos;', "'")
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&amp;', '&');
  }
}
