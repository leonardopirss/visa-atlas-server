import { Injectable } from '@nestjs/common';
import { unzipSync } from 'fflate';
import { IngestionValidationError } from '../../validation/ingestion-validation.error.js';
import { UK_HOME_OFFICE_WORKSHEET } from './uk-home-office.config.js';
import type { UkHomeOfficeCell, UkHomeOfficeRow } from './uk-home-office.types.js';

const MAX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

@Injectable()
export class UkHomeOfficeWorkbookReader {
  read(buffer: Buffer): UkHomeOfficeRow[] {
    let archive: Record<string, Uint8Array>;
    try {
      archive = unzipSync(new Uint8Array(buffer));
    } catch {
      throw new IngestionValidationError('UK_HOME_OFFICE_XLSX_INVALID');
    }
    const uncompressedBytes = Object.values(archive).reduce(
      (total, entry) => total + entry.byteLength,
      0,
    );
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new IngestionValidationError('UK_HOME_OFFICE_XLSX_EXPANDED_TOO_LARGE');
    }

    const workbook = this.text(archive, 'xl/workbook.xml');
    const relationships = this.text(archive, 'xl/_rels/workbook.xml.rels');
    const relationshipId = this.sheetRelationshipId(workbook);
    const target = this.relationshipTarget(relationships, relationshipId);
    const sheetPath = target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`;
    const worksheet = this.text(archive, sheetPath);
    const sharedStrings = archive['xl/sharedStrings.xml']
      ? this.sharedStrings(this.text(archive, 'xl/sharedStrings.xml'))
      : [];
    return this.rows(worksheet, sharedStrings);
  }

  private text(archive: Record<string, Uint8Array>, path: string): string {
    const entry = archive[path];
    if (!entry) throw new IngestionValidationError(`UK_HOME_OFFICE_XLSX_ENTRY_MISSING:${path}`);
    return new TextDecoder().decode(entry);
  }

  private sheetRelationshipId(workbook: string): string {
    const escapedName = UK_HOME_OFFICE_WORKSHEET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = workbook.match(
      new RegExp(`<sheet\\b[^>]*name="${escapedName}"[^>]*r:id="([^"]+)"[^>]*/?>`, 'i'),
    );
    if (!match?.[1]) throw new IngestionValidationError('UK_HOME_OFFICE_WORKSHEET_MISSING');
    return match[1];
  }

  private relationshipTarget(relationships: string, relationshipId: string): string {
    const escapedId = relationshipId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = relationships.match(
      new RegExp(`<Relationship\\b[^>]*Id="${escapedId}"[^>]*Target="([^"]+)"[^>]*/?>`, 'i'),
    );
    if (!match?.[1])
      throw new IngestionValidationError('UK_HOME_OFFICE_WORKSHEET_RELATION_MISSING');
    return this.decodeXml(match[1]);
  }

  private sharedStrings(xml: string): string[] {
    return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
      [...(match[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
        .map((text) => this.decodeXml(text[1] ?? ''))
        .join(''),
    );
  }

  private rows(xml: string, sharedStrings: string[]): UkHomeOfficeRow[] {
    return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
      const row: UkHomeOfficeCell[] = [];
      for (const cellMatch of (rowMatch[1] ?? '').matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attributes = cellMatch[1] ?? '';
        const content = cellMatch[2] ?? '';
        const reference = attributes.match(/\br="([A-Z]+)\d+"/)?.[1];
        if (!reference) continue;
        const index = this.columnIndex(reference);
        const type = attributes.match(/\bt="([^"]+)"/)?.[1];
        const raw = content.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (type === 'inlineStr') {
          row[index] = this.decodeXml(content.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '');
        } else if (raw === undefined) {
          row[index] = null;
        } else if (type === 's') {
          row[index] = sharedStrings[Number(raw)] ?? null;
        } else {
          const number = Number(raw);
          row[index] = Number.isFinite(number) ? number : this.decodeXml(raw);
        }
      }
      return row;
    });
  }

  private columnIndex(reference: string): number {
    return (
      [...reference].reduce((result, character) => result * 26 + character.charCodeAt(0) - 64, 0) -
      1
    );
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
