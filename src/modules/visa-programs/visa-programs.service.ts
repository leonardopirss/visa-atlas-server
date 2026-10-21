import { Injectable } from '@nestjs/common';
import type { VisaPurposeCode } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service.js';

@Injectable()
export class VisaProgramsService {
  constructor(private readonly prisma: PrismaService) {}

  async listVerified(destinationIso3: string, purpose: VisaPurposeCode) {
    const programs = await this.prisma.visaProgram.findMany({
      where: {
        destinationIso3,
        purposeCode: purpose,
        verifiedAt: { not: null },
        officialUrl: { not: null },
      },
      orderBy: { officialTitle: 'asc' },
    });
    return programs.map((program) => ({
      id: program.id,
      title: program.officialTitle,
      purpose: program.purposeCode,
      sponsorshipRequirement: program.sponsorshipRequirement,
      officialUrl: program.officialUrl,
      verifiedAt: program.verifiedAt?.toISOString() ?? null,
      summary: program.description,
    }));
  }
}
